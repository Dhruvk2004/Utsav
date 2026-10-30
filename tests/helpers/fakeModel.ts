import type { GenerateRequest, PlanModel, ToolCall, ToolRequest } from "@/lib/ai/model";

/**
 * A scripted model: `tools` answers function-calling requests, `json` answers JSON requests (a
 * value is stringified; a list is replayed one reply per call, the last one repeating). Every
 * request is kept, so tests can check what was sent.
 */
export interface FakeModel extends PlanModel {
  prompts: string[];
  requests: (GenerateRequest | ToolRequest)[];
}

type Reply<T> = T | Error | (() => T);

function take<T>(replies: Reply<T>[], index: number): T {
  const reply = replies[Math.min(index, replies.length - 1)];
  if (reply instanceof Error) throw reply;
  return typeof reply === "function" ? (reply as () => T)() : reply;
}

export function fakeModel({ tools = [[]], json = [{}] }: { tools?: Reply<ToolCall[]>[]; json?: Reply<unknown>[] } = {}): FakeModel {
  let toolCalls = 0;
  let jsonCalls = 0;
  const model: FakeModel = {
    name: "fake-model",
    prompts: [],
    requests: [],
    async callTools(request) {
      model.prompts.push(request.prompt);
      model.requests.push(request);
      return take(tools, toolCalls++);
    },
    async generateJson(request) {
      model.prompts.push(request.prompt);
      model.requests.push(request);
      const reply = take(json, jsonCalls++);
      return typeof reply === "string" ? reply : JSON.stringify(reply);
    },
  };
  return model;
}

export const call = (name: string, args: Record<string, unknown>): ToolCall => ({ name, args });
