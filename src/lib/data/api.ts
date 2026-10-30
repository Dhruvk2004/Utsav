import type { z } from "zod";

/**
 * The browser side of the JSON API (spec 12.1): same-origin requests with the session cookie,
 * responses validated with the same Zod schemas the server writes with, and errors carried as
 * `ApiRequestError` with the server's code, message and any extra body fields.
 */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The whole error body, e.g. the latest `event` on a 409 version conflict. */
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

function errorOf(status: number, body: unknown): ApiRequestError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : {};
  const code = typeof error.code === "string" ? error.code : "http_error";
  const message = typeof error.message === "string" ? error.message : "Something went wrong. Try again.";
  return new ApiRequestError(status, code, message, record);
}

export class Api {
  constructor(private readonly fetcher: Fetch = (input, init) => fetch(input, init)) {}

  /** Sends a request and returns the validated JSON body (or undefined for 204). */
  async request<S extends z.ZodType>(path: string, schema: S, options: ApiOptions = {}): Promise<z.output<S>> {
    const { method = "GET", body, signal } = options;
    const response = await this.fetcher(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) throw errorOf(response.status, json);
    return schema.parse(json);
  }
}
