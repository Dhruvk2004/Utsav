const abortError = () => new DOMException("Aborted", "AbortError");

/** Resolves after `ms`, or rejects with an AbortError as soon as `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const abort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** True for the error a cancelled request rejects with. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
