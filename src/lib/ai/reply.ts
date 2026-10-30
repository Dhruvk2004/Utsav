import type { z } from "zod";
import type { GenerateRequest, PlanModel } from "./model";

/**
 * Reading a JSON reply (spec 6.1 pipeline): strip a ```json fence, parse, validate with the
 * touchpoint's Zod schema, and ask once more when the reply does not parse. Timeouts and other
 * model errors are not retried (spec 9.6).
 */

export const MAX_ATTEMPTS = 2;

export class ReplyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplyParseError";
  }
}

export function parseReply<S extends z.ZodType>(raw: string, schema: S, what = "the expected format"): z.output<S> {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(unfenced);
  } catch {
    throw new ReplyParseError("The AI reply was not valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new ReplyParseError(`The AI reply did not match ${what}: ${result.error.issues[0]?.message}`);
  return result.data;
}

export async function generateValidated<S extends z.ZodType>(model: PlanModel, request: GenerateRequest, schema: S): Promise<z.output<S>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return parseReply(await model.generateJson(request), schema);
    } catch (error) {
      if (!(error instanceof ReplyParseError) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
