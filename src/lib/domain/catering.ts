import type { CateringEstimate } from "./schemas";

export const DEFAULT_BUFFER_PERCENT = 10;

/**
 * Plates to order for a sit-down or buffet meal: guest count plus a safety
 * buffer for walk-ins, rounded up to the nearest 5 as caterers usually quote.
 */
export function estimateCatering(guestCount: number, bufferPercent = DEFAULT_BUFFER_PERCENT): CateringEstimate {
  if (!Number.isInteger(guestCount) || guestCount < 0) throw new RangeError("guestCount must be a non-negative integer");
  if (bufferPercent < 0 || bufferPercent > 100) throw new RangeError("bufferPercent must be between 0 and 100");
  if (guestCount === 0) return { plates: 0, bufferPercent };
  const withBuffer = Math.ceil(guestCount * (1 + bufferPercent / 100));
  return { plates: Math.ceil(withBuffer / 5) * 5, bufferPercent };
}
