import { encodeTimestamps, type TimestampCodec } from "@/lib/server/db/timestamps";
import type { Db, DocData, DocEntry, QueryOptions, Tx } from "@/lib/server/db/types";

/**
 * An in-memory `Db` with Firestore's path, query and transaction semantics: reads before writes,
 * writes buffered until the transaction body resolves, nothing written when it throws, and
 * optimistic concurrency: when a document the transaction read was changed by another commit in
 * the meantime, the body runs again on fresh data (Firestore retries up to 5 attempts). Documents
 * are cloned on the way in and out, as a real database would serialise them.
 */

function fieldAt(data: DocData, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as DocData)[key] : undefined), data);
}

function project(data: DocData, paths: string[]): DocData {
  const out: DocData = {};
  for (const path of paths) {
    const keys = path.split(".");
    const value = fieldAt(data, path);
    if (value === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as DocData;
    target[keys[keys.length - 1]] = structuredClone(value);
  }
  return out;
}

/**
 * Firestore rejects `undefined` anywhere in a document ("Cannot use \"undefined\" as a Firestore
 * value"; the app does not set `ignoreUndefinedProperties`). Writes here go through the same
 * `encodeTimestamps` as `firestoreDb` (with ISO strings kept as they are), which drops the
 * undefined fields it can, and then refuse what Firestore would refuse (QA-01).
 */
const isoCodec: TimestampCodec<string> = {
  fromIso: (iso) => iso,
  isTimestamp: (value): value is string => value instanceof Date,
  toIso: (iso) => iso,
};

export function assertFirestoreValue(value: unknown, path: string): void {
  if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  if (Array.isArray(value)) value.forEach((item, i) => assertFirestoreValue(item, `${path}.${i}`));
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) assertFirestoreValue(item, path ? `${path}.${key}` : key);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return a === b ? 0 : String(a) < String(b) ? -1 : 1;
}

const MAX_ATTEMPTS = 5;

export class MemoryDb implements Db {
  readonly docs = new Map<string, DocData>();
  private ids = 0;
  /** Commit count per path, so a transaction can tell whether what it read is still current. */
  private readonly revisions = new Map<string, number>();
  /** Transactions that had to run again because of a concurrent commit (for tests). */
  retries = 0;

  async get(path: string): Promise<DocData | null> {
    const doc = this.docs.get(path);
    return doc ? structuredClone(doc) : null;
  }

  private children(collection: string): DocEntry[] {
    const prefix = `${collection}/`;
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: structuredClone(data) }));
  }

  async query(collection: string, options: QueryOptions = {}): Promise<DocEntry[]> {
    const entries = this.children(collection).filter(({ data }) =>
      (options.where ?? []).every(({ field, value }) => fieldAt(data, field) === value),
    );
    const order = options.orderBy;
    if (order)
      entries.sort((a, b) => compare(fieldAt(a.data, order.field), fieldAt(b.data, order.field)) * (order.direction === "asc" ? 1 : -1));
    const select = options.select;
    if (options.limit !== undefined) entries.splice(options.limit);
    return select ? entries.map(({ id, data }) => ({ id, data: project(data, select) })) : entries;
  }

  newId(collection: string): string {
    this.ids += 1;
    return `${collection.split("/").pop()}-${this.ids}`;
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const writes: [string, DocData | null][] = [];
      const seen = new Map<string, number>();
      const revision = (path: string) => this.revisions.get(path) ?? 0;
      // Firestore requires every read in a transaction to come before the first write.
      const read = <T>(paths: () => string[], value: () => Promise<T>): Promise<T> => {
        if (writes.length > 0) throw new Error("Transactions must perform all reads before writes");
        for (const path of paths()) if (!seen.has(path)) seen.set(path, revision(path));
        return value();
      };
      const tx: Tx = {
        get: (path) =>
          read(
            () => [path],
            () => this.get(path),
          ),
        list: (collection) =>
          read(
            () => [`${collection}/`, ...this.children(collection).map((c) => `${collection}/${c.id}`)],
            async () => this.children(collection),
          ),
        set: (path, data) => {
          const stored = encodeTimestamps(data, isoCodec) as DocData;
          assertFirestoreValue(stored, "");
          writes.push([path, structuredClone(stored)]);
        },
        delete: (path) => void writes.push([path, null]),
      };
      const result = await fn(tx);
      const stale = [...seen].some(([path, at]) => revision(path) !== at);
      if (stale && attempt < MAX_ATTEMPTS) {
        this.retries += 1;
        continue;
      }
      if (stale) throw new Error("Transaction contention: too many attempts");
      for (const [path, data] of writes) {
        if (data) this.docs.set(path, data);
        else this.docs.delete(path);
        this.revisions.set(path, revision(path) + 1);
        const parent = path.slice(0, path.lastIndexOf("/") + 1);
        this.revisions.set(parent, revision(parent) + 1);
      }
      return result;
    }
  }

  async deleteTree(path: string): Promise<void> {
    for (const key of [...this.docs.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.docs.delete(key);
    }
  }
}
