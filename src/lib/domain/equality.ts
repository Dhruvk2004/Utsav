/** Structural equality for plain JSON data that ignores key order (stored documents may reorder map keys). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}

/** Equality as JSON would store it: keys holding `undefined` are ignored. */
export function sameJson(a: unknown, b: unknown): boolean {
  return sameValue(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
}
