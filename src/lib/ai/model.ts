import { FinishReason, FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { aiPlanDraftSchema } from "@/lib/domain/schemas";

export interface GenerateRequest {
  systemInstruction: string;
  prompt: string;
  signal?: AbortSignal;
  /** JSON Schema of the reply; the plan draft schema when omitted. */
  responseSchema?: Record<string, unknown>;
  /** Per touchpoint (spec 6.11): plan 0.6, ideas 0.8, what-if 0.3, enquiry 0.5. */
  temperature?: number;
  maxOutputTokens?: number;
}

/** A function the model may call (Gemini function calling, spec 6.3). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolRequest {
  systemInstruction: string;
  prompt: string;
  tools: readonly ToolDeclaration[];
  temperature: number;
  signal?: AbortSignal;
}

/** The narrow interface the app needs from a language model, so tests can swap in a fake. */
export interface PlanModel {
  readonly name: string;
  generateJson(request: GenerateRequest): Promise<string>;
  /** Asks for function calls only (`mode: ANY`); throws when the reply has none. */
  callTools(request: ToolRequest): Promise<ToolCall[]>;
}

/**
 * JSON Schema for a Zod schema, in the draft-7 shape Gemini accepts. Tool arguments use the input
 * side, so fields with defaults stay optional for the model and trimming transforms are allowed.
 */
export function jsonSchemaOf(schema: z.ZodType, io: "input" | "output" = "output"): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io, target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** JSON Schema sent to Gemini, generated from the same Zod schema used to validate the reply. */
export function draftJsonSchema(): Record<string, unknown> {
  return jsonSchemaOf(aiPlanDraftSchema);
}

export type ModelEnv = Partial<
  Record<
    | "GEMINI_API_KEY"
    | "GEMINI_MODEL"
    | "GEMINI_FALLBACK_MODEL"
    | "GOOGLE_GENAI_USE_VERTEXAI"
    | "GOOGLE_CLOUD_PROJECT"
    | "GOOGLE_CLOUD_LOCATION",
    string
  >
> &
  Record<string, string | undefined>;

export const DEFAULT_MODEL = "gemini-flash-latest";
export const FALLBACK_MODEL = "gemini-flash-lite-latest";
/** The main model gets a short turn, because the fallback can still answer inside the request. */
export const PRIMARY_TIMEOUT_MS = 18_000;
export const FALLBACK_TIMEOUT_MS = 30_000;
/** After a failure the main model is skipped for this long, so nobody waits for it twice. */
export const PRIMARY_COOLDOWN_MS = 60_000;
/** Thinking tokens count against these limits, so each leaves room for them on top of the reply. */
const PLAN_MAX_TOKENS = 12_288;
/** Every touchpoint other than the plan (spec 6.11). */
export const MAX_OUTPUT_TOKENS = 6_144;
/** Replies are checked in code, so a light think is enough; the Flash default (medium or high) is slower. */
const THINKING_CONFIG = { thinkingLevel: ThinkingLevel.LOW };

interface GeminiClient {
  client: GoogleGenAI;
  model: string;
  /** Tried when the main model is busy or fails; null when there is none for this setup. */
  fallback: string | null;
  /** The Vertex AI location, or "gemini-api" when a local API key is used. */
  location: string;
}

/**
 * The Gemini client for the server environment. On Cloud Run we use Vertex AI with the service
 * account (no key at all); locally a Gemini API key works. Null when nothing is configured.
 */
function geminiClient(env: ModelEnv): GeminiClient | null {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (env.GOOGLE_GENAI_USE_VERTEXAI === "true" && env.GOOGLE_CLOUD_PROJECT) {
    const location = env.GOOGLE_CLOUD_LOCATION || "global";
    const client = new GoogleGenAI({ vertexai: true, project: env.GOOGLE_CLOUD_PROJECT, location });
    // The -latest aliases are Gemini API names, so Vertex AI only falls back to a model named for it.
    return { client, model, fallback: env.GEMINI_FALLBACK_MODEL || null, location };
  }
  if (env.GEMINI_API_KEY) {
    return {
      client: new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }),
      model,
      fallback: env.GEMINI_FALLBACK_MODEL || FALLBACK_MODEL,
      location: "gemini-api",
    };
  }
  return null;
}

/** The reply hit the output limit, so its JSON is cut off. */
export class ModelTruncatedError extends Error {
  override name = "ModelTruncatedError";
  constructor() {
    super("The model reply reached the output limit");
  }
}

/**
 * Runs a model call on the main model, then on the fallback if that is busy, slow or fails, so a
 * demand spike on one model does not send people to the template. A caller's abort is not retried.
 */
function modelRunner(gemini: GeminiClient, clock: () => number) {
  let primarySkippedUntil = 0;
  return async function run<T>(callerSignal: AbortSignal | undefined, call: (attempt: ModelAttempt) => Promise<T>): Promise<T> {
    const useFallback = gemini.fallback !== null && gemini.fallback !== gemini.model;
    const skipPrimary = useFallback && clock() < primarySkippedUntil;
    if (!skipPrimary) {
      try {
        return await call({
          model: gemini.model,
          thinkingConfig: THINKING_CONFIG,
          signal: withTimeout(callerSignal, useFallback ? PRIMARY_TIMEOUT_MS : FALLBACK_TIMEOUT_MS),
        });
      } catch (error) {
        if (!useFallback || callerSignal?.aborted) throw error;
        primarySkippedUntil = clock() + PRIMARY_COOLDOWN_MS;
      }
    }
    // No thinking level here: the lighter models don't all accept the same ones.
    return call({ model: gemini.fallback as string, signal: withTimeout(callerSignal, FALLBACK_TIMEOUT_MS) });
  };
}

interface ModelAttempt {
  model: string;
  thinkingConfig?: typeof THINKING_CONFIG;
  signal: AbortSignal;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Creates the plan model, or null when nothing is configured (plans then use the starter template). */
export function createGeminiModel(env: ModelEnv): PlanModel | null {
  const gemini = geminiClient(env);
  if (!gemini) return null;
  const { client, model } = gemini;
  const planSchema = draftJsonSchema();
  const run = modelRunner(gemini, Date.now);
  return {
    name: model,
    async generateJson({ systemInstruction, prompt, signal, responseSchema, temperature, maxOutputTokens }) {
      return run(signal, async (attempt) => {
        const response = await client.models.generateContent({
          model: attempt.model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: responseSchema ?? planSchema,
            temperature: temperature ?? 0.6,
            maxOutputTokens: maxOutputTokens ?? PLAN_MAX_TOKENS,
            ...(attempt.thinkingConfig ? { thinkingConfig: attempt.thinkingConfig } : {}),
            abortSignal: attempt.signal,
          },
        });
        if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) throw new ModelTruncatedError();
        const text = response.text;
        if (!text) throw new Error("The model returned an empty response");
        return text;
      });
    },
    async callTools({ systemInstruction, prompt, tools, temperature, signal }) {
      return run(signal, async (attempt) => {
        const response = await client.models.generateContent({
          model: attempt.model,
          contents: prompt,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: tools.map((tool) => ({ ...tool })) }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
            temperature,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...(attempt.thinkingConfig ? { thinkingConfig: attempt.thinkingConfig } : {}),
            abortSignal: attempt.signal,
          },
        });
        const calls = (response.functionCalls ?? []).map((call) => ({ name: call.name ?? "", args: call.args ?? {} }));
        if (calls.length === 0) throw new Error("The model returned no function calls");
        return calls;
      });
    },
  };
}

/** Model reachability for `/api/health` (spec 9.6): which model and location, and whether it answers. */
export interface ModelProbe {
  id: string;
  location: string;
  reachable(): Promise<boolean>;
}

const PING_TIMEOUT_MS = 5_000;

export function createModelProbe(env: ModelEnv): ModelProbe {
  const gemini = geminiClient(env);
  const id = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!gemini) return { id, location: "none", reachable: async () => false };
  return {
    id,
    location: gemini.location,
    async reachable() {
      try {
        // Counting tokens is free and proves the model id exists at this location.
        await gemini.client.models.countTokens({
          model: gemini.model,
          contents: "ping",
          config: { abortSignal: AbortSignal.timeout(PING_TIMEOUT_MS) },
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
