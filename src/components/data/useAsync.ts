"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError } from "@/lib/data/wait";

export type AsyncState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: unknown };

/**
 * Loads data on mount and on `retry()`, cancelling the request when the component unmounts or
 * reloads. `load` must be stable (wrap it in useCallback) or it reloads on every render.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>): { state: AsyncState<T>; retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => {
        if (!isAbortError(error)) setState({ status: "error", error });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
