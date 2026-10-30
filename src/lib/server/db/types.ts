/**
 * The slice of Firestore the repositories use, addressed by document path ("events/abc"). The Admin
 * SDK adapter (`src/lib/server/firebase/firestoreDb.ts`) implements it over Firestore; the tests'
 * `MemoryDb` implements it in memory with the same rules. Timestamps are ISO strings on this side.
 */

export type DocData = Record<string, unknown>;

export interface Where {
  field: string;
  op: "==";
  value: string | number | boolean | null;
}

export interface QueryOptions {
  where?: Where[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  /** At most this many documents, after ordering. */
  limit?: number;
  /** Field paths to return (a projection), e.g. `["details", "budget.total"]`. */
  select?: string[];
}

export interface DocEntry {
  id: string;
  data: DocData;
}

/** Reads and writes inside one transaction. All reads happen before the first write. */
export interface Tx {
  get(path: string): Promise<DocData | null>;
  list(collection: string): Promise<DocEntry[]>;
  set(path: string, data: DocData): void;
  delete(path: string): void;
}

export interface Db {
  get(path: string): Promise<DocData | null>;
  query(collection: string, options?: QueryOptions): Promise<DocEntry[]>;
  /** A new random document id for `collection` (Firestore's 20-character ids). */
  newId(collection: string): string;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Deletes a document and every subcollection under it. */
  deleteTree(path: string): Promise<void>;
}
