import { Timestamp, type DocumentData, type Firestore, type Query } from "firebase-admin/firestore";
import { decodeTimestamps, encodeTimestamps, type TimestampCodec } from "../db/timestamps";
import type { Db, DocData, DocEntry, Tx } from "../db/types";

/**
 * The `Db` interface over the Admin SDK's Firestore: a thin delegation plus timestamp conversion
 * (tested in `timestamps.ts`). Repositories hold all the logic and are tested against `MemoryDb`.
 */

const codec: TimestampCodec<Timestamp> = {
  fromIso: (iso) => Timestamp.fromDate(new Date(iso)),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
  toIso: (value) => value.toDate().toISOString(),
};

const encode = (data: DocData) => encodeTimestamps(data, codec) as DocumentData;
const decode = (data: DocumentData | undefined) => (data ? (decodeTimestamps(data, codec) as DocData) : null);

export function firestoreDb(firestore: Firestore): Db {
  const entries = (docs: { id: string; data(): DocumentData }[]): DocEntry[] =>
    docs.map((doc) => ({ id: doc.id, data: decode(doc.data()) ?? {} }));
  return {
    async get(path) {
      return decode((await firestore.doc(path).get()).data());
    },
    async query(collection, options = {}) {
      let query: Query = firestore.collection(collection);
      for (const { field, op, value } of options.where ?? []) query = query.where(field, op, value);
      if (options.orderBy) query = query.orderBy(options.orderBy.field, options.orderBy.direction);
      if (options.limit !== undefined) query = query.limit(options.limit);
      if (options.select) query = query.select(...options.select);
      return entries((await query.get()).docs);
    },
    newId(collection) {
      return firestore.collection(collection).doc().id;
    },
    transaction(fn) {
      return firestore.runTransaction((transaction) => {
        const tx: Tx = {
          get: async (path) => decode((await transaction.get(firestore.doc(path))).data()),
          list: async (collection) => entries((await transaction.get(firestore.collection(collection))).docs),
          set: (path, data) => void transaction.set(firestore.doc(path), encode(data)),
          delete: (path) => void transaction.delete(firestore.doc(path)),
        };
        return fn(tx);
      });
    },
    deleteTree(path) {
      return firestore.recursiveDelete(firestore.doc(path));
    },
  };
}
