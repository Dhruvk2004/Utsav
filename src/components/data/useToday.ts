"use client";

import { useSyncExternalStore } from "react";
import { todayInIndia } from "@/lib/domain/dates";

const subscribe = () => () => {};

/**
 * Today's date in India on the client, or null while prerendering. Pages built at build time must
 * not read the clock (Cache Components forbids it), so date helpers render once the page hydrates.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, todayInIndia, () => null);
}
