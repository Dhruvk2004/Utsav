import type { z } from "zod";

/**
 * Request and response helpers shared by every route handler. Handlers stay free of Next.js
 * imports so they can be unit tested with plain `Request` objects.
 */

export const MAX_BODY_BYTES = 10_000;
/** PATCH and decide carry ops, so they get a little more room (spec 9.1). */
export const MAX_APPLY_BODY_BYTES = 16_000;

export type ApiError = { error: { code: string; message: string; fields?: Record<string, string> } };

/** Authenticated and per-user responses are never cached (spec 9.3). */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(NO_STORE)) headers.set(key, value);
  return Response.json(data, { status: init.status ?? 200, headers });
}

export function noContent(headers?: HeadersInit): Response {
  const out = new Headers(headers);
  for (const [key, value] of Object.entries(NO_STORE)) out.set(key, value);
  return new Response(null, { status: 204, headers: out });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Partial<Omit<ApiError["error"], "code" | "message">> & Record<string, unknown> = {},
  headers?: HeadersInit,
): Response {
  const { fields, ...rest } = extra;
  return json({ error: { code, message, ...(fields ? { fields } : {}) }, ...rest }, { status, headers });
}

export const notFound = () => errorResponse(404, "not_found", "We couldn't find that.");

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Issues keyed by their dotted path ("functions.0.date"), first message wins. */
export function fieldErrors(issues: readonly z.core.$ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    fields[key] ??= issue.message;
  }
  return fields;
}

/** The MIME type of a `Content-Type` header without its parameters, lower-cased ("application/json"). */
export function mimeType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Reads a JSON body: JSON content type, size limit, valid JSON, then the schema. The type is
 * compared as a whole MIME type, so a CORS-safelisted `text/plain; charset=application/json` (which
 * a cross-site page can send without a preflight) is refused (SEC-07).
 */
export async function readJson<S extends z.ZodType>(request: Request, schema: S, maxBytes = MAX_BODY_BYTES): Promise<Parsed<z.output<S>>> {
  if (mimeType(request.headers.get("content-type")) !== "application/json") {
    return { ok: false, response: errorResponse(415, "unsupported_media_type", "Send the request as JSON.") };
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > maxBytes) {
    return { ok: false, response: errorResponse(413, "too_large", "The request is too large.") };
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json", "The request body is not valid JSON.") };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(400, "invalid_input", "Some details need fixing.", { fields: fieldErrors(parsed.error.issues) }),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * CSRF check for mutations (spec 9.1): the browser's `Origin` must be the app's public origin.
 * Without APP_ORIGIN configured, the request's own origin is the reference.
 */
export function isSameOrigin(request: Request, appOrigin: string | null): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === (appOrigin ?? new URL(request.url).origin);
}

export const forbiddenOrigin = () => errorResponse(403, "bad_origin", "This request came from another site.");

export function rateLimited(retryAfterSeconds: number, message: string): Response {
  return errorResponse(429, "rate_limited", message, { retryAfterSeconds }, { "Retry-After": String(retryAfterSeconds) });
}
