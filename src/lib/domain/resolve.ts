import { nameKey } from "./ops/context";

/**
 * Name-to-id resolution (spec 6.3): people say "decor" or "the sangeet", the plan stores ids.
 * An id from the context matches first, then a case-insensitive, whitespace-normalised exact
 * name, then a unique prefix. Zero or several matches give a reason the card can show.
 */

export type Resolved = { ok: true; id: string } | { ok: false; reason: string };

export function resolveName<T extends { id: string }>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  noun: string,
): Resolved {
  const key = nameKey(query);
  const byId = items.find((item) => item.id === query.trim());
  if (byId) return { ok: true, id: byId.id };
  const exact = items.filter((item) => nameKey(nameOf(item)) === key);
  const matches = exact.length > 0 ? exact : key ? items.filter((item) => nameKey(nameOf(item)).startsWith(key)) : [];
  if (matches.length === 1) return { ok: true, id: matches[0].id };
  if (matches.length === 0) return { ok: false, reason: `No ${noun} called "${query.trim()}"` };
  return { ok: false, reason: `${matches.length} ${noun}s match "${query.trim()}"; pick one` };
}
