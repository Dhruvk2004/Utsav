// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AiRequestError, type AiClient } from "@/lib/data/aiClient";
import { Api, ApiRequestError } from "@/lib/data/api";
import { aiError, HttpAiClient, SandboxAiClient } from "@/lib/data/httpAiClient";
import { demoWorkspace } from "@/lib/demo/session";
import { EventRepo } from "@/lib/server/repos/events";
import { SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";
import { demoFixture } from "@/lib/demo/fixtures";
import { TODAY, wedding } from "../../domainFixtures";
import { call, fakeModel, type FakeModel } from "../../helpers/fakeModel";
import { inProcessFetch } from "../../helpers/inProcessFetch";
import { testDeps } from "../../helpers/server";

/** The AI clients over the real route handlers (in process), as the workspace and the demo use them. */

const DECOR_CUT_CALL = call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -20, rebalance: "change_total" });

async function signedIn(model: FakeModel | null) {
  const deps = testDeps({ model });
  const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
  const fetcher = inProcessFetch(deps);
  return { deps, id, fetcher, client: new HttpAiClient(id, () => wedding(), new Api(fetcher)) };
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe("HttpAiClient", () => {
  it("posts AI mode and ideas to the event's routes and returns stored proposals", async () => {
    const { client, fetcher, id } = await signedIn(fakeModel({ tools: [[DECOR_CUT_CALL]] }));
    const result = await client.instruct({ instruction: "Cut decor", tab: "budget", previousTurns: [] });
    expect(result).toMatchObject({ recorded: false, proposal: { id: expect.any(String), items: [{ status: "pending" }] } });
    expect((await client.ideas({ focus: [], instruction: "" })).proposal.origin).toBe("library");
    expect(fetcher.calls).toEqual([`POST /api/events/${id}/ai/instruct`, `POST /api/events/${id}/ai/ideas`]);
  });

  it("maps the smart re-plan onto the plan on screen and returns the enquiry draft", async () => {
    const model = fakeModel({
      json: [
        {
          lines: [
            { category: "Decor", percent: 10 },
            { category: "Fireworks", percent: 5 },
          ],
          notes: ["n"],
          tradeoffs: [],
        },
        { subject: "s", body: "Hi [Vendor name], hello.", placeholders: [] },
      ],
    });
    const { client } = await signedIn(model);
    const plan = await client.whatif({ newTotal: 2_000_000, protect: [], instruction: "" });
    expect(plan.notes).toEqual(["n"]);
    expect(plan.ignored).toEqual(["Fireworks"]);
    expect(plan.rows.length).toBe(wedding().budget.lines.length);
    const draft = await client.enquiry("vendor-caterer", {
      channel: "email",
      language: "en",
      tone: "formal",
      includeBudget: false,
      questions: [],
    });
    expect(draft).toMatchObject({ origin: "ai", generatedDraftId: expect.stringMatching(/^gen-/) });
  });

  it("explains failures: not configured, and rate limited with minutes to wait", async () => {
    const { client, deps } = await signedIn(null);
    // No model on the deployment is its own kind, so the panel offers no Retry (MQW-07, CO-08).
    expect(await rejection(client.instruct({ instruction: "Cut decor", tab: "budget", previousTurns: [] }))).toEqual(
      new AiRequestError("not_configured"),
    );
    for (let i = 0; i < 60; i++) deps.limits.mutation.check("u1");
    const limited = await rejection(client.ideas({ focus: [], instruction: "" }));
    expect(limited).toMatchObject({ kind: "rate_limited", retryAfterMinutes: 1 });
  });
});

describe("aiError", () => {
  it("keeps aborts, and maps sandbox, rate-limit and other errors to the panel's kinds", () => {
    const abort = new DOMException("Aborted", "AbortError");
    expect(aiError(abort)).toBe(abort);
    expect(aiError(new ApiRequestError(400, "SANDBOX_STATE_INVALID", "x", {}))).toMatchObject({ kind: "sandbox_invalid" });
    expect(aiError(new ApiRequestError(429, "rate_limited", "x", { retryAfterSeconds: 3600 }))).toMatchObject({
      kind: "rate_limited",
      retryAfterMinutes: 60,
    });
    expect(aiError(new ApiRequestError(429, "rate_limited", "x", {}))).toMatchObject({ kind: "rate_limited", retryAfterMinutes: 1 });
    expect(aiError(new Error("network"))).toMatchObject({ kind: "unavailable" });
  });
});

describe("SandboxAiClient (public demo)", () => {
  it("sends the visitor's accepted ops and turns, so a follow-up builds on them", async () => {
    const deps = testDeps();
    const fetcher = inProcessFetch(deps, null);
    const workspace = demoWorkspace("wedding", TODAY, new Api(fetcher));
    const first = await workspace.ai.instruct({ instruction: "Cut decor spend by 20%", tab: "budget", previousTurns: [] });
    expect(first.recorded).toBe(true);
    await workspace.store.decide(first.proposal, [{ itemId: first.proposal.items[0].id, action: "accept" }]);
    const second = await workspace.ai.instruct({
      instruction: "Make that 15% instead",
      tab: "budget",
      previousTurns: workspace.store.previousTurns,
    });
    expect(second.proposal.items[0]).toMatchObject({ status: "pending", op: { value: 255_000 } });
    expect(fetcher.calls).toEqual(["POST /api/demo/wedding/ai/instruct", "POST /api/demo/wedding/ai/instruct"]);
  });

  it('sends which accepted ops came from an "instead" answer (MQR-02 d)', async () => {
    const store = new SandboxPlanStore(demoFixture("wedding", TODAY).event, TODAY);
    vi.spyOn(store, "replacingOps", "get").mockReturnValue([1]);
    const send = vi.fn(
      async (path: string, init?: RequestInit) => (
        void path,
        void init,
        Response.json({ error: { code: "x", message: "x" } }, { status: 500 })
      ),
    );
    const client = new SandboxAiClient("wedding", store, {} as AiClient, new Api(send));
    await client.instruct({ instruction: "No, make it 10% instead", tab: "budget", previousTurns: [] }).catch(() => null);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({ appliedOps: [], replacingOps: [1] });
  });

  it("asks the demo whether it has live AI, and says null when it can't tell (MQR-03)", async () => {
    const store = new SandboxPlanStore(demoFixture("wedding", TODAY).event, TODAY);
    const answers = [Response.json({ live: false }), Response.json({ error: { code: "x", message: "x" } }, { status: 500 })];
    const send = vi.fn(async (path: string) => (void path, answers.shift()!));
    const client = new SandboxAiClient("wedding", store, {} as AiClient, new Api(send));
    expect(await client.liveAi()).toBe(false);
    expect(send.mock.calls[0][0]).toBe("/api/demo/wedding/ai");
    expect(await client.liveAi()).toBeNull();
  });

  it("sends dismissed idea titles, and leaves What-if and enquiry drafts to the recordings", async () => {
    const send = vi.fn(async (_path: string, init?: RequestInit) => {
      void init;
      return Response.json({ error: { code: "SANDBOX_STATE_INVALID", message: "Reset" } }, { status: 400 });
    });
    const store = new SandboxPlanStore(demoFixture("birthday", TODAY).event, TODAY);
    const fallback = { whatif: vi.fn(async () => "smart"), enquiry: vi.fn(async () => "draft") } as unknown as AiClient;
    const client = new SandboxAiClient("birthday", store, fallback, new Api(send));
    expect(await rejection(client.ideas({ focus: ["decor"], instruction: "" }))).toMatchObject({ kind: "sandbox_invalid" });
    const sent = JSON.parse(String(send.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(sent).toEqual({ focus: ["decor"], instruction: "", dismissedTitles: store.getPlan().dismissedIdeaTitles, appliedOps: [] });
    expect(await client.whatif({ newTotal: 1, protect: [], instruction: "" })).toBe("smart");
    expect(await client.enquiry("v", { channel: "email", language: "en", tone: "warm", includeBudget: false, questions: [] })).toBe(
      "draft",
    );
  });
});
