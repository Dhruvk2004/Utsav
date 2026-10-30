// A scripted stand-in for the Gemini REST API, for the signed-in E2E run only; no product code knows
// it exists. It is reached through the SDK's own `GOOGLE_GEMINI_BASE_URL` override. Replies are
// chosen from the request: function calling (AI mode) by keywords in the user's instruction, JSON
// touchpoints by the response schema. Plan generation fails on purpose, so new events use the
// starter template exactly as they do with no model configured. (No credentials are faked: under
// the emulator the Admin SDK uses gRPC and needs none, QA-08.)
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 3462);

const call = (name, args) => ({ functionCall: { name, args } });

/** AI-mode replies keyed by a phrase in the instruction (spec 6.3 eval rows the E2E uses). */
function instructParts(instruction) {
  const text = instruction.toLowerCase();
  if (text.includes("cut decor"))
    return [call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -20, rebalance: "change_total" })];
  if (text.includes("15%"))
    return [call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -15, rebalance: "change_total" })];
  if (text.includes("extras")) {
    return [
      call("add_task", { title: "Book a dhol player", category: "Entertainment", daysBefore: 30 }),
      call("add_idea", {
        title: "Marigold welcome arch",
        description: "Fresh marigold strings at the entrance",
        category: "decor",
        basis: ["details.vibe"],
      }),
      call("add_task", { title: "Confirm the pandit", category: "Venue", daysBefore: 20 }),
    ];
  }
  return [call("reply", { text: "I can help with budget, timeline, vendors and ideas." })];
}

/** The current instruction: the last one in the prompt (earlier turns come first, spec 6.3). */
function instructionOf(prompt) {
  const matches = [...prompt.matchAll(/"instruction":\s*"((?:[^"\\]|\\.)*)"/g)];
  return matches.length ? JSON.parse(`"${matches.at(-1)[1]}"`) : "";
}

const IDEAS = {
  ideas: [
    {
      title: "Rangoli corner for kids",
      description: "A supervised rangoli table with stencils",
      category: "activity",
      estimatedCost: 3000,
      costBasis: "per event",
      basis: [],
      effort: "diy",
    },
    {
      title: "Masala chai counter",
      description: "Live chai with three spice levels",
      category: "food",
      estimatedCost: 8000,
      costBasis: "per event",
      basis: [],
      effort: "vendor",
    },
  ],
};

const WHATIF = {
  lines: [
    { category: "Catering", percent: 34 },
    { category: "Decor", percent: 8 },
  ],
  notes: ["Food matters most to your guests, so catering keeps its share."],
  tradeoffs: [
    {
      kind: "task",
      title: "Ask for a buffet quote",
      detail: "A buffet is usually cheaper per plate",
      category: "Catering",
      daysBefore: 40,
    },
  ],
};

const ENQUIRY = {
  subject: "Enquiry for our wedding",
  body: "Hello [Vendor name],\n\nWe are planning a wedding and would like a quote. Are you available?\n\nThank you",
  placeholders: ["[Vendor name]"],
};

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const textReply = (value) => ({
  candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(value) }] }, finishReason: "STOP" }],
});

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/health") return reply(res, 200, { ok: true });
    if (req.url?.includes(":countTokens")) return reply(res, 200, { totalTokens: 1 });
    if (!req.url?.includes(":generateContent")) return reply(res, 404, { error: { code: 404, message: "Not found", status: "NOT_FOUND" } });
    const body = JSON.parse(raw || "{}");
    const prompt = body.contents?.[0]?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
    // "server error" in an instruction makes the model fail, so the app's failure path shows.
    if (body.tools && instructionOf(prompt).toLowerCase().includes("server error"))
      return reply(res, 500, { error: { code: 500, message: "Internal", status: "INTERNAL" } });
    if (body.tools) {
      return reply(res, 200, {
        candidates: [{ content: { role: "model", parts: instructParts(instructionOf(prompt)) }, finishReason: "STOP" }],
      });
    }
    const properties = body.generationConfig?.responseJsonSchema?.properties ?? {};
    if (properties.ideas) return reply(res, 200, textReply(IDEAS));
    if (properties.lines) return reply(res, 200, textReply(WHATIF));
    if (properties.body && properties.subject) return reply(res, 200, textReply(ENQUIRY));
    // The plan draft: fail, so creation falls back to the starter template.
    return reply(res, 503, { error: { code: 503, message: "Unavailable", status: "UNAVAILABLE" } });
  });
}).listen(PORT, "127.0.0.1");
