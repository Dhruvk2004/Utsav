import { describe, expect, it } from "vitest";
import type { EventDoc } from "@/lib/domain/model/event";
import { AI, applyOk, rejectReason, USER, wedding } from "../../domainFixtures";

const find = (plan: EventDoc, id: string) => plan.vendors.find((v) => v.id === id);

describe("add_vendor", () => {
  it("adds a vendor to research with its links, questions and first history entry", () => {
    const plan = applyOk(
      wedding(),
      {
        type: "add_vendor",
        category: "Photo booth",
        budgetLineId: "line-entertainment",
        functionIds: ["fn-sangeet", "fn-sangeet"],
        bookByDaysBefore: 30,
        questions: ["Are props included?"],
      },
      AI,
    );
    expect(find(plan, "vendor-photo-booth")).toMatchObject({
      label: "",
      contact: "",
      functionIds: ["fn-sangeet"],
      status: "to_research",
      quotedAmount: null,
      paidAmount: 0,
      history: [{ status: "to_research", at: AI.now }],
      origin: "ai",
    });
  });

  it("defaults to no links and rejects ones that do not resolve", () => {
    const plan = applyOk(wedding(), { type: "add_vendor", category: "Florist", bookByDaysBefore: 20 });
    expect(find(plan, "vendor-florist")).toMatchObject({ budgetLineId: null, functionIds: [], questions: [] });
    expect(rejectReason(wedding(), { type: "add_vendor", category: "X", budgetLineId: "line-x", bookByDaysBefore: 1 })).toMatch(
      /Budget category not found/,
    );
    expect(rejectReason(wedding(), { type: "add_vendor", category: "X", functionIds: ["fn-x"], bookByDaysBefore: 1 })).toMatch(
      /Function not found/,
    );
  });

  it("caps a plan at 40 vendors", () => {
    let plan = wedding();
    for (let i = plan.vendors.length; i < 40; i++) plan = applyOk(plan, { type: "add_vendor", category: `V${i}`, bookByDaysBefore: 1 });
    expect(rejectReason(plan, { type: "add_vendor", category: "One more", bookByDaysBefore: 1 })).toMatch(/at most 40/);
  });
});

describe("update_vendor", () => {
  it("lets the user set a label, contact and amounts", () => {
    const plan = applyOk(wedding(), {
      type: "update_vendor",
      vendorId: "vendor-decorator",
      patch: { label: "Studio near Aundh", contact: "98xxxxxx", quotedAmount: 280_000, functionIds: ["fn-haldi", "fn-haldi"] },
    });
    expect(find(plan, "vendor-decorator")).toMatchObject({
      label: "Studio near Aundh",
      contact: "98xxxxxx",
      quotedAmount: 280_000,
      functionIds: ["fn-haldi"],
      origin: "user",
    });
  });

  it("keeps the origin when only links or amounts change", () => {
    const plan = applyOk(wedding(), { type: "update_vendor", vendorId: "vendor-pandit", patch: { budgetLineId: "line-contingency" } });
    expect(find(plan, "vendor-pandit")).toMatchObject({ budgetLineId: "line-contingency", origin: "ai" });
  });

  it("never lets AI write labels or contacts", () => {
    expect(rejectReason(wedding(), { type: "update_vendor", vendorId: "vendor-decorator", patch: { label: "Any" } }, AI)).toMatch(
      /only be entered by you/,
    );
    expect(rejectReason(wedding(), { type: "update_vendor", vendorId: "vendor-decorator", patch: { contact: "x" } }, AI)).toMatch(
      /only be entered by you/,
    );
    const plan = applyOk(wedding(), { type: "update_vendor", vendorId: "vendor-decorator", patch: { notes: "Ask for samples" } }, AI);
    expect(find(plan, "vendor-decorator")?.origin).toBe("ai");
  });

  it("keeps booked vendors quoted", () => {
    expect(rejectReason(wedding(), { type: "update_vendor", vendorId: "vendor-venue", patch: { quotedAmount: null } })).toMatch(
      /Add the quoted amount for Venue/,
    );
  });
});

describe("set_vendor_status", () => {
  it("books a vendor with its quote and records the change", () => {
    const plan = applyOk(wedding(), { type: "set_vendor_status", vendorId: "vendor-mehndi-artist", status: "booked" }, AI);
    const mehndi = find(plan, "vendor-mehndi-artist");
    expect(mehndi?.status).toBe("booked");
    expect(mehndi?.history.at(-1)).toEqual({ status: "booked", at: AI.now });
    expect(plan.stats.committed).toBe(1_163_000);
  });

  it("marks a vendor paid with amounts and allows paying more than quoted", () => {
    const plan = applyOk(wedding(), {
      type: "set_vendor_status",
      vendorId: "vendor-decorator",
      status: "paid",
      quotedAmount: 250_000,
      paidAmount: 260_000,
    });
    expect(find(plan, "vendor-decorator")).toMatchObject({ status: "paid", quotedAmount: 250_000, paidAmount: 260_000 });
  });

  it("updates amounts without a new history entry when the status is unchanged", () => {
    const before = find(wedding(), "vendor-venue")?.history.length;
    const plan = applyOk(wedding(), { type: "set_vendor_status", vendorId: "vendor-venue", status: "booked", paidAmount: 200_000 });
    expect(find(plan, "vendor-venue")?.history.length).toBe(before);
  });

  it("requires a quote to book and a payment to mark paid", () => {
    expect(rejectReason(wedding(), { type: "set_vendor_status", vendorId: "vendor-decorator", status: "booked" })).toMatch(/quoted amount/);
    expect(rejectReason(wedding(), { type: "set_vendor_status", vendorId: "vendor-decorator", status: "paid", quotedAmount: 1 })).toMatch(
      /amount paid/,
    );
  });

  it("keeps only the latest 20 history entries", () => {
    let plan = wedding();
    for (let i = 0; i < 12; i++) {
      plan = applyOk(plan, { type: "set_vendor_status", vendorId: "vendor-pandit", status: "contacted" });
      plan = applyOk(plan, { type: "set_vendor_status", vendorId: "vendor-pandit", status: "to_research" });
    }
    expect(find(plan, "vendor-pandit")?.history).toHaveLength(20);
  });
});

describe("remove_vendor", () => {
  it("removes a vendor with its drafts", () => {
    const plan = applyOk(wedding(), { type: "remove_vendor", vendorId: "vendor-venue" });
    expect(find(plan, "vendor-venue")).toBeUndefined();
    expect(plan.stats.committed).toBe(668_000);
  });

  it("does not let AI remove booked or paid vendors", () => {
    expect(rejectReason(wedding(), { type: "remove_vendor", vendorId: "vendor-venue" }, AI)).toMatch(/mark it not needed instead/);
    applyOk(wedding(), { type: "remove_vendor", vendorId: "vendor-pandit" }, AI);
  });
});

describe("drafts", () => {
  const draft = { channel: "whatsapp", language: "en", subject: "", body: "Hello [Vendor name]" } as const;

  it("saves a user draft and keeps the generated origin only for an unchanged generated draft", () => {
    const ctx = {
      ...USER,
      draftOrigin: (vendorId: string, id: string, body: string) => (id === "gen-1" && body === draft.body ? ("ai" as const) : null),
    };
    let plan = applyOk(wedding(), { type: "save_draft", vendorId: "vendor-decorator", draft, generatedDraftId: "gen-1" }, ctx);
    plan = applyOk(
      plan,
      { type: "save_draft", vendorId: "vendor-decorator", draft: { ...draft, body: "Edited" }, generatedDraftId: "gen-1" },
      ctx,
    );
    plan = applyOk(plan, { type: "save_draft", vendorId: "vendor-decorator", draft, generatedDraftId: "unknown" });
    expect(find(plan, "vendor-decorator")?.drafts.map((d) => [d.id, d.origin])).toEqual([
      ["draft-decorator-1", "ai"],
      ["draft-decorator-2", "user"],
      ["draft-decorator-3", "user"],
    ]);
    expect(rejectReason(plan, { type: "save_draft", vendorId: "vendor-decorator", draft })).toMatch(/at most 3 drafts/);
  });

  it("removes a draft and rejects unknown ones", () => {
    let plan = applyOk(wedding(), { type: "save_draft", vendorId: "vendor-decorator", draft });
    plan = applyOk(plan, { type: "remove_draft", vendorId: "vendor-decorator", draftId: "draft-decorator-1" });
    expect(find(plan, "vendor-decorator")?.drafts).toEqual([]);
    expect(rejectReason(plan, { type: "remove_draft", vendorId: "vendor-decorator", draftId: "draft-decorator-1" })).toMatch(
      /Draft not found/,
    );
  });
});
