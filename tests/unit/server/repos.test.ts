// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CREATION_HISTORY_ID } from "@/lib/plan/commands";
import { EventRepo, eventPath, historyPath, privateSharePath, sharePath } from "@/lib/server/repos/events";
import { toProfile, UserRepo, userPath } from "@/lib/server/repos/users";
import { proposalOf, DECOR_CUT } from "../../contracts/planStoreContract";
import { wedding } from "../../domainFixtures";
import { MemoryDb } from "../../helpers/memoryDb";
import { NOW, TODAY } from "../../helpers/server";

const identity = { displayName: "Asha Rao", photoURL: null, email: "asha@example.com" };
const clock = { today: TODAY, now: NOW };

describe("UserRepo", () => {
  it("creates the profile on first sign-in only", async () => {
    const db = new MemoryDb();
    const users = new UserRepo(db);
    const created = await users.ensure("u1", identity, TODAY, NOW);
    expect(created).toMatchObject({ displayName: "Asha Rao", onboardedAt: null, aiUsage: { day: TODAY, count: 0 }, createdAt: NOW });
    await users.savePatch("u1", identity, { homeCity: "Pune" }, clock);
    expect((await users.ensure("u1", { ...identity, displayName: "Other" }, TODAY, NOW)).homeCity).toBe("Pune");
    expect(toProfile(created)).not.toHaveProperty("createdAt");
  });

  it("merges patches and sets onboardedAt once", async () => {
    const users = new UserRepo(new MemoryDb());
    const first = await users.savePatch("u1", identity, { displayName: "Asha", markOnboarded: true }, clock);
    expect(first.onboardedAt).toBe(NOW);
    const later = await users.savePatch("u1", identity, { language: "hi" }, { today: TODAY, now: "2026-10-29T06:00:00.000Z" });
    expect(later).toMatchObject({ displayName: "Asha", language: "hi", onboardedAt: NOW, updatedAt: "2026-10-29T06:00:00.000Z" });
  });

  it("counts AI calls against the daily quota, resetting each day", async () => {
    const users = new UserRepo(new MemoryDb());
    expect(await users.consumeAi("u1", identity, 2, clock)).toBe(true);
    expect(await users.consumeAi("u1", identity, 2, clock)).toBe(true);
    expect(await users.consumeAi("u1", identity, 2, clock)).toBe(false);
    expect((await users.get("u1"))?.aiUsage).toEqual({ day: TODAY, count: 2 });
    expect(await users.consumeAi("u1", identity, 2, { today: "2026-10-29", now: NOW })).toBe(true);
  });

  it("deletes the profile", async () => {
    const db = new MemoryDb();
    await new UserRepo(db).ensure("u1", identity, TODAY, NOW);
    await new UserRepo(db).delete("u1");
    expect(db.docs.has(userPath("u1"))).toBe(false);
  });
});

describe("EventRepo", () => {
  async function seeded() {
    const db = new MemoryDb();
    const repo = new EventRepo(db);
    const later = { ...wedding(), ownerUid: "u1", details: { ...wedding().details, eventDate: "2027-03-01" } };
    const first = await repo.create({ ...wedding(), ownerUid: "u1" }, null);
    const second = await repo.create(later, null);
    const archived = await repo.create({ ...wedding(), ownerUid: "u1", status: "archived" }, null);
    const others = await repo.create({ ...wedding(), ownerUid: "u2" }, null);
    return { db, repo, first, second, archived, others };
  }

  it("lists a user's active events by date as dashboard projections", async () => {
    const { repo, first, second } = await seeded();
    const summaries = await repo.summaries("u1");
    expect(summaries.map((s) => s.id)).toEqual([first, second]);
    expect(summaries[0]).toEqual({
      id: first,
      status: "active",
      source: wedding().source,
      details: wedding().details,
      stats: wedding().stats,
      budgetTotal: 2_500_000,
      guests: wedding().guests.total,
    });
    expect(summaries[0]).not.toHaveProperty("tasks");
  });

  it("gives an event only to its owner", async () => {
    const { repo, first } = await seeded();
    expect(await repo.owned(first, "u1")).not.toBeNull();
    expect(await repo.owned(first, "u2")).toBeNull();
    expect(await repo.owned("missing", "u1")).toBeNull();
    expect(await repo.withEvent(first, "u2", async () => "ran")).toBeNull();
    expect(await repo.withEvent(first, "u1", async () => "ran")).toEqual({ value: "ran" });
  });

  it("writes the creation entry under its fixed id", async () => {
    const db = new MemoryDb();
    const id = await new EventRepo(db).create(wedding(), {
      actor: "system",
      label: "AI plan created",
      ops: [],
      before: {},
      versionBefore: 0,
      versionAfter: 1,
      createdAt: NOW,
      expireAt: NOW,
    });
    expect(db.docs.has(historyPath(id, CREATION_HISTORY_ID))).toBe(true);
  });

  it("stores proposals without their id field and reads them back with it", async () => {
    const { repo, first, db } = await seeded();
    await repo.withEvent(first, "u1", async (_event, tx) => {
      tx.saveProposal("p1", { ...proposalOf([DECOR_CUT]), id: "p1" });
    });
    expect(db.docs.get(`${eventPath(first)}/proposals/p1`)).not.toHaveProperty("id");
    const read = await repo.withEvent(first, "u1", async (_event, tx) => ({
      one: await tx.proposal("p1"),
      all: await tx.proposals(),
      none: await tx.proposal("none"),
    }));
    expect(read?.value.one?.id).toBe("p1");
    expect(read?.value.all).toHaveLength(1);
    expect(read?.value.none).toBeNull();
  });

  it("deletes an event with its subcollections and share docs; lists every owned id", async () => {
    const { repo, db, first, archived, second } = await seeded();
    await repo.withEvent(first, "u1", async (event, tx) => {
      tx.saveShare("hash", { eventId: first, ownerUid: "u1", showAmounts: true, showNotes: false, createdAt: NOW, revokedAt: null });
      tx.saveShareToken("token");
      tx.addHistory({ actor: "user", label: "x", ops: [], before: {}, versionBefore: 1, versionAfter: 2, createdAt: NOW, expireAt: NOW });
      tx.saveEvent(event);
    });
    expect(await repo.findShare("hash")).not.toBeNull();
    expect((await repo.ownedIds("u1")).sort()).toEqual([first, second, archived].sort());
    await repo.delete(first);
    expect([...db.docs.keys()].some((path) => path.startsWith(eventPath(first)))).toBe(false);
    expect(db.docs.has(sharePath("hash"))).toBe(false);
    expect(db.docs.has(privateSharePath(first))).toBe(false);
    expect(await repo.findShare("hash")).toBeNull();
  });
});
