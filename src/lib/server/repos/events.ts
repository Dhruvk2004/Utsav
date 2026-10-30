import { z } from "zod";
import type { EventSummary } from "@/lib/data/eventsRepository";
import { eventDocSchema, type EventDoc } from "@/lib/domain/model/event";
import { historySchema, proposalSchema, shareDocSchema, type HistoryDoc, type Proposal, type ShareDoc } from "@/lib/domain/model/records";
import { CREATION_HISTORY_ID } from "@/lib/plan/commands";
import type { Db, Tx } from "../db/types";

/**
 * `events/{eventId}` and its subcollections (spec 8.2): the plan aggregate, `history`, `proposals`
 * and `private/share`, plus the `shares/{tokenHash}` docs that point at it. Every write to an
 * event happens inside `withEvent`, one transaction that first checks the caller owns it.
 */

/**
 * Ids from a URL (event, proposal, history) before any Firestore path is built from them (SEC-06).
 * Firestore's auto-ids are 20 letters and digits; the test double adds a hyphen. No slash, dot or
 * underscore, so an id can never add path segments, climb (`..`) or name a reserved `__x__` doc.
 */
const DOC_ID = /^[A-Za-z0-9-]{1,40}$/;
export const isDocId = (id: string): boolean => DOC_ID.test(id);

export const eventPath = (id: string) => `events/${id}`;
export const historyPath = (eventId: string, id: string) => `events/${eventId}/history/${id}`;
export const proposalsPath = (eventId: string) => `events/${eventId}/proposals`;
export const privateSharePath = (eventId: string) => `events/${eventId}/private/share`;
export const sharePath = (tokenHash: string) => `shares/${tokenHash}`;

export type StoredProposal = Proposal & { id: string };

/** The id is the document's name, never a field inside it. */
const storedProposalSchema = proposalSchema.omit({ id: true });

/** Fields the dashboard reads (spec 9.3): never the embedded arrays. */
const SUMMARY_FIELDS = ["details", "status", "source", "budget.total", "guests.total", "stats"];
const summarySchema = eventDocSchema
  .pick({ details: true, status: true, source: true, stats: true })
  .extend({ budget: z.object({ total: z.number() }), guests: z.object({ total: z.number() }) });

/** One event's documents inside a transaction. Reads come first; writes are applied on commit. */
export class EventTx {
  constructor(
    private readonly tx: Tx,
    private readonly db: Db,
    readonly eventId: string,
  ) {}

  async history(id: string): Promise<HistoryDoc | null> {
    if (!isDocId(id)) return null;
    const data = await this.tx.get(historyPath(this.eventId, id));
    return data ? historySchema.parse(data) : null;
  }

  async proposal(id: string): Promise<StoredProposal | null> {
    if (!isDocId(id)) return null;
    const data = await this.tx.get(`${proposalsPath(this.eventId)}/${id}`);
    return data ? { ...storedProposalSchema.parse(data), id } : null;
  }

  async proposals(): Promise<StoredProposal[]> {
    return (await this.tx.list(proposalsPath(this.eventId))).map(({ id, data }) => ({ ...storedProposalSchema.parse(data), id }));
  }

  async shareToken(): Promise<string | null> {
    const data = await this.tx.get(privateSharePath(this.eventId));
    return typeof data?.token === "string" ? data.token : null;
  }

  async share(tokenHash: string): Promise<ShareDoc | null> {
    const data = await this.tx.get(sharePath(tokenHash));
    return data ? shareDocSchema.parse(data) : null;
  }

  saveEvent(event: EventDoc): void {
    this.tx.set(eventPath(this.eventId), event);
  }

  /** Writes a history entry and returns its id. */
  addHistory(entry: HistoryDoc, id = this.db.newId(`${eventPath(this.eventId)}/history`)): string {
    this.tx.set(historyPath(this.eventId, id), entry);
    return id;
  }

  newProposalId(): string {
    return this.db.newId(proposalsPath(this.eventId));
  }

  saveProposal(id: string, proposal: Proposal): void {
    this.tx.set(`${proposalsPath(this.eventId)}/${id}`, storedProposalSchema.parse(proposal));
  }

  deleteProposal(id: string): void {
    this.tx.delete(`${proposalsPath(this.eventId)}/${id}`);
  }

  saveShare(tokenHash: string, share: ShareDoc): void {
    this.tx.set(sharePath(tokenHash), share);
  }

  saveShareToken(token: string | null): void {
    if (token) this.tx.set(privateSharePath(this.eventId), { token });
    else this.tx.delete(privateSharePath(this.eventId));
  }
}

export class EventRepo {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<EventDoc | null> {
    if (!isDocId(id)) return null;
    const data = await this.db.get(eventPath(id));
    return data ? eventDocSchema.parse(data) : null;
  }

  /** The event when `uid` owns it; anyone else gets null, shown as a 404 (spec 3.3, never 403). */
  async owned(id: string, uid: string): Promise<EventDoc | null> {
    const event = await this.get(id);
    return event?.ownerUid === uid ? event : null;
  }

  /** Dashboard cards: a projection query, so the plan arrays never leave Firestore (spec 9.3). */
  async summaries(uid: string): Promise<EventSummary[]> {
    const rows = await this.db.query("events", {
      where: [
        { field: "ownerUid", op: "==", value: uid },
        { field: "status", op: "==", value: "active" },
      ],
      orderBy: { field: "details.eventDate", direction: "asc" },
      select: SUMMARY_FIELDS,
    });
    return rows.map(({ id, data }) => {
      const { budget, guests, ...card } = summarySchema.parse(data);
      return { id, ...card, budgetTotal: budget.total, guests: guests.total };
    });
  }

  /** Creates an event, with its creation history entry when there is one, in one transaction. */
  create(event: EventDoc, creation: HistoryDoc | null): Promise<string> {
    const id = this.db.newId("events");
    return this.db.transaction(async (tx) => {
      const events = new EventTx(tx, this.db, id);
      events.saveEvent(event);
      if (creation) events.addHistory(creation, CREATION_HISTORY_ID);
      return id;
    });
  }

  /**
   * Runs `fn` in a transaction over an event the caller owns. Resolves to null (a 404) when the
   * event does not exist or belongs to someone else, before `fn` runs.
   */
  async withEvent<T>(id: string, uid: string, fn: (event: EventDoc, tx: EventTx) => Promise<T>): Promise<{ value: T } | null> {
    if (!isDocId(id)) return null;
    return this.db.transaction(async (tx) => {
      const data = await tx.get(eventPath(id));
      const event = data ? eventDocSchema.parse(data) : null;
      if (!event || event.ownerUid !== uid) return null;
      return { value: await fn(event, new EventTx(tx, this.db, id)) };
    });
  }

  /**
   * Hard-deletes an event with its history, proposals and share docs (spec 5.9). Resolves to the
   * deleted share docs' token hashes, so the caller can evict them from the share cache.
   */
  async delete(id: string): Promise<string[]> {
    const shares = await this.db.query("shares", { where: [{ field: "eventId", op: "==", value: id }] });
    for (const share of shares) await this.db.deleteTree(sharePath(share.id));
    await this.db.deleteTree(eventPath(id));
    return shares.map((share) => share.id);
  }

  /** Every event a user owns, any status (account deletion). */
  async ownedIds(uid: string): Promise<string[]> {
    return (await this.db.query("events", { where: [{ field: "ownerUid", op: "==", value: uid }], select: [] })).map((row) => row.id);
  }

  /**
   * The latest unexpired proposals of one touchpoint, oldest first: AI mode's previous turns
   * (spec 6.3, `orderBy(createdAt desc)` on the touchpoint index).
   */
  async recentProposals(eventId: string, touchpoint: Proposal["touchpoint"], now: string, limit: number): Promise<StoredProposal[]> {
    const rows = await this.db.query(proposalsPath(eventId), {
      where: [{ field: "touchpoint", op: "==", value: touchpoint }],
      orderBy: { field: "createdAt", direction: "desc" },
    });
    return rows
      .map(({ id, data }) => ({ ...storedProposalSchema.parse(data), id }))
      .filter((proposal) => proposal.expireAt > now)
      .slice(0, limit)
      .reverse();
  }

  /** The latest `limit` history entries, newest first (an "instead" follow-up's earlier changes, MQR-02). */
  async recentHistory(eventId: string, limit: number): Promise<HistoryDoc[]> {
    const rows = await this.db.query(`${eventPath(eventId)}/history`, { orderBy: { field: "versionAfter", direction: "desc" }, limit });
    return rows.map(({ data }) => historySchema.parse(data));
  }

  /**
   * Unexpired proposals that still have an undecided item, oldest first (CO-02): what the
   * dashboard's "N suggestions waiting" counts, so the workspace can show them again.
   */
  async waitingProposals(eventId: string, now: string): Promise<StoredProposal[]> {
    const rows = await this.db.query(proposalsPath(eventId), { orderBy: { field: "createdAt", direction: "asc" } });
    return rows
      .map(({ id, data }) => ({ ...storedProposalSchema.parse(data), id }))
      .filter((proposal) => proposal.expireAt > now && proposal.items.some((item) => item.status === "pending"));
  }

  async findShare(tokenHash: string): Promise<ShareDoc | null> {
    const data = await this.db.get(sharePath(tokenHash));
    return data ? shareDocSchema.parse(data) : null;
  }
}
