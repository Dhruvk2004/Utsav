"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWorkspace, type EditOptions } from "@/components/workspace/WorkspaceContext";
import { AiRequestError, type AiErrorKind, type AiResult } from "@/lib/data/aiClient";
import { isAbortError } from "@/lib/data/wait";
import type { IdeaCategory } from "@/lib/domain/model/enums";
import type { Decision, Proposal } from "@/lib/domain/model/records";
import type { DecisionResult } from "@/lib/domain/ops/decide";
import type { PreviousTurn } from "@/lib/plan/PlanStore";
import { latestChanges, replacesEarlier, type LineStep } from "@/lib/plan/replaceEarlier";
import type { RecordedReason } from "@/lib/demo/recordings";

/**
 * The AI conversation for one open event (spec 6.3): every proposal batch (AI mode, ideas,
 * what-if trade-offs, and code proposals shown inline under their control), their cards'
 * decisions and the batch each accepted card belongs to, so its Undo reverts exactly that.
 */

export type TurnKind = "instruct" | "ideas" | "whatif" | "code";

export interface Turn {
  id: number;
  kind: TurnKind;
  /** Where a code proposal renders inline, e.g. "idea:idea-fusion-haldi" or "reset:timeline". */
  anchor: string | null;
  proposal: Proposal;
  recorded: boolean;
  /** Why a recorded answer was used (MQW-08). */
  recordedReason?: RecordedReason;
  /** Batch number of each applied item, for its Undo. */
  batches: Record<string, number>;
  /** Loaded from the server's waiting proposals when the event opened (CO-02), not asked in this visit. */
  restored?: boolean;
}

/** Which part of the workspace shows a stored proposal of each touchpoint. */
export function turnKindOf(touchpoint: Proposal["touchpoint"]): TurnKind {
  return touchpoint === "instruct" || touchpoint === "ideas" || touchpoint === "whatif" ? touchpoint : "code";
}

export type RequestKind = "instruct" | "ideas";
export type RequestState = { status: "idle" } | { status: "loading" } | { status: "error"; kind: AiErrorKind; retryAfterMinutes: number };

const PREVIOUS_TURNS = 4;
const IDLE: RequestState = { status: "idle" };

export interface AiSessionValue {
  panelOpen: boolean;
  openPanel: (prefill?: string) => void;
  closePanel: () => void;
  draft: string;
  setDraft: (text: string) => void;
  turns: Turn[];
  requests: Record<RequestKind, RequestState>;
  askInstruct: (instruction: string) => Promise<Turn | null>;
  askIdeas: (focus: IdeaCategory[], instruction: string) => Promise<Turn | null>;
  cancel: (kind: RequestKind) => void;
  addTurn: (kind: TurnKind, proposal: Proposal, anchor?: string | null) => Turn;
  /** A request that failed as a whole is reported in a toast unless the caller shows it (`showsError`). */
  decideItems: (turnId: number, decisions: Decision[], options?: EditOptions) => Promise<DecisionResult[]>;
  undoItem: (turnId: number, itemId: string) => Promise<boolean>;
  /**
   * Per budget line, the AI change still in effect that an "instead" follow-up replaces: the line's
   * amount before it and after it (the server's rule, `latestChanges`), for follow-up cards.
   */
  earlier: Record<string, { before: number; after: number }>;
  pendingCount: number;
  clear: () => void;
}

const AiSessionContext = createContext<AiSessionValue | null>(null);

export function useAiSession(): AiSessionValue {
  const value = useContext(AiSessionContext);
  if (!value) throw new Error("useAiSession must be used inside <AiSessionProvider>");
  return value;
}

export function AiSessionProvider({ initialPrompt, children }: { initialPrompt?: string; children: ReactNode }) {
  const { workspace, tab, decide, undo } = useWorkspace();
  const [panelOpen, setPanelOpen] = useState(initialPrompt !== undefined);
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [requests, setRequests] = useState<Record<RequestKind, RequestState>>({ instruct: IDLE, ideas: IDLE });
  // Each AI budget change this visit, tagged with its batch so an Undo drops it (MQR-05).
  const [steps, setSteps] = useState<(LineStep & { batch: number })[]>([]);
  const earlier = useMemo(() => Object.fromEntries(latestChanges(steps)), [steps]);
  const nextId = useRef(0);
  const controllers = useRef<Partial<Record<RequestKind, AbortController>>>({});
  // Handlers read the latest turns without re-creating themselves on every change. Every update
  // goes through `updateTurns`, which writes the ref at once, so a decision that waited for an
  // earlier one reads the turn that one left, not the one from before it (QA-19).
  const turnsRef = useRef(turns);
  const updateTurns = useCallback((change: (list: Turn[]) => Turn[]) => {
    turnsRef.current = change(turnsRef.current);
    setTurns(turnsRef.current);
  }, []);
  // Card decisions run one at a time, in the order they were made (QA-19).
  const decisions = useRef<Promise<unknown>>(Promise.resolve());

  // Suggestions left undecided on an earlier visit come back as turns, so the dashboard's
  // "N suggestions waiting" can be found and decided here (CO-02, MQW-02, BP-03).
  useEffect(() => {
    if (!workspace.waitingProposals) return;
    const controller = new AbortController();
    workspace
      .waitingProposals(controller.signal)
      .then((proposals) => {
        if (controller.signal.aborted || proposals.length === 0) return;
        updateTurns((list) => {
          const known = new Set(list.map((t) => t.proposal.id).filter(Boolean));
          const restored = proposals
            .filter((p) => !known.has(p.id))
            .map((proposal): Turn => ({
              id: ++nextId.current,
              kind: turnKindOf(proposal.touchpoint),
              anchor: null,
              proposal,
              recorded: false,
              batches: {},
              restored: true,
            }));
          return [...restored, ...list];
        });
      })
      .catch(() => {
        // Waiting suggestions are a convenience; the workspace works without them.
      });
    return () => controller.abort();
  }, [workspace, updateTurns]);

  const addTurn = useCallback(
    (kind: TurnKind, proposal: Proposal, anchor: string | null = null, recorded = false, recordedReason?: RecordedReason) => {
      const turn: Turn = {
        id: ++nextId.current,
        kind,
        anchor,
        proposal,
        recorded,
        batches: {},
        ...(recordedReason ? { recordedReason } : {}),
      };
      updateTurns((list) => [...list.filter((t) => anchor === null || t.anchor !== anchor), turn]);
      return turn;
    },
    [updateTurns],
  );

  const run = useCallback(
    async (kind: RequestKind, call: (signal: AbortSignal) => Promise<AiResult>) => {
      controllers.current[kind]?.abort();
      const controller = new AbortController();
      controllers.current[kind] = controller;
      setRequests((r) => ({ ...r, [kind]: { status: "loading" } }));
      try {
        const { proposal, recorded, reason } = await call(controller.signal);
        setRequests((r) => ({ ...r, [kind]: IDLE }));
        return addTurn(kind, proposal, null, recorded, reason);
      } catch (error) {
        if (isAbortError(error)) {
          setRequests((r) => ({ ...r, [kind]: IDLE }));
          return null;
        }
        const failure = error instanceof AiRequestError ? error : new AiRequestError("unavailable");
        setRequests((r) => ({ ...r, [kind]: { status: "error", kind: failure.kind, retryAfterMinutes: failure.retryAfterMinutes } }));
        return null;
      }
    },
    [addTurn],
  );

  const askInstruct = useCallback(
    (instruction: string) => {
      const previousTurns: PreviousTurn[] = turnsRef.current
        .filter((t) => t.kind === "instruct")
        .slice(-PREVIOUS_TURNS)
        .map((t) => ({
          instruction: t.proposal.instruction,
          items: t.proposal.items.map((i) => ({ summary: i.summary, status: i.status })),
        }));
      return run("instruct", (signal) => workspace.ai.instruct({ instruction, tab, previousTurns }, signal));
    },
    [run, workspace.ai, tab],
  );

  const askIdeas = useCallback(
    (focus: IdeaCategory[], instruction: string) => run("ideas", (signal) => workspace.ai.ideas({ focus, instruction }, signal)),
    [run, workspace.ai],
  );

  const cancel = useCallback((kind: RequestKind) => controllers.current[kind]?.abort(), []);

  const decideNow = useCallback(
    async (turnId: number, chosen: Decision[], options?: EditOptions) => {
      const turn = turnsRef.current.find((t) => t.id === turnId);
      if (!turn) return [];
      const before = workspace.store.getPlan();
      const { result, batch } = await decide(turn.proposal, chosen, options);
      if (batch !== null) {
        // Each line an applied item changed, with its amounts before and after this decision.
        const applied = new Set(
          result.results.filter((r) => r.ok && (r.status === "accepted" || r.status === "edited")).map((r) => r.itemId),
        );
        const lines = new Set(
          result.proposal.items.flatMap((item) =>
            applied.has(item.id) && item.op.type === "adjust_budget_category" ? [item.op.lineId] : [],
          ),
        );
        const amount = (lineId: string, plan = before) => plan.budget.lines.find((l) => l.id === lineId)?.amount;
        const replaces = replacesEarlier(turn.proposal.instruction);
        const added = [...lines].flatMap((lineId) => {
          const [was, now] = [amount(lineId), amount(lineId, result.plan)];
          return was === undefined || now === undefined ? [] : [{ lineId, before: was, after: now, replaces, batch }];
        });
        if (added.length > 0) setSteps((list) => [...list, ...added]);
      }
      updateTurns((list) =>
        list.map((t) => {
          if (t.id !== turnId) return t;
          // Items auto-accepted as dependencies share the batch, so one Undo reverts them together.
          const newlyApplied = result.proposal.items.filter(
            (item) => (item.status === "accepted" || item.status === "edited") && !(item.id in t.batches),
          );
          const batches =
            batch === null ? t.batches : { ...t.batches, ...Object.fromEntries(newlyApplied.map((item) => [item.id, batch])) };
          return { ...t, proposal: result.proposal, batches };
        }),
      );
      return result.results;
    },
    [workspace.store, decide, updateTurns],
  );

  const decideItems = useCallback(
    (turnId: number, chosen: Decision[], options?: EditOptions) => {
      const run = decisions.current.then(() => decideNow(turnId, chosen, options));
      decisions.current = run.catch(() => undefined);
      return run;
    },
    [decideNow],
  );

  const undoItem = useCallback(
    async (turnId: number, itemId: string) => {
      const batch = turnsRef.current.find((t) => t.id === turnId)?.batches[itemId];
      if (batch === undefined || !(await undo(batch))) return false;
      setSteps((list) => list.filter((step) => step.batch !== batch));
      updateTurns((list) =>
        list.map((t) => {
          const reverted = Object.keys(t.batches).filter((id) => t.batches[id] === batch);
          if (reverted.length === 0) return t;
          const items = t.proposal.items.map((item) => (reverted.includes(item.id) ? { ...item, status: "pending" as const } : item));
          return {
            ...t,
            proposal: { ...t.proposal, items },
            batches: Object.fromEntries(Object.entries(t.batches).filter(([, b]) => b !== batch)),
          };
        }),
      );
      return true;
    },
    [undo, updateTurns],
  );

  const clear = useCallback(() => {
    updateTurns(() => []);
    setSteps([]);
    setRequests({ instruct: IDLE, ideas: IDLE });
  }, [updateTurns]);

  const pendingCount = turns.reduce((n, t) => n + t.proposal.items.filter((i) => i.status === "pending").length, 0);

  const value = useMemo<AiSessionValue>(
    () => ({
      panelOpen,
      openPanel: (prefill) => {
        if (prefill !== undefined) setDraft(prefill);
        setPanelOpen(true);
      },
      closePanel: () => setPanelOpen(false),
      draft,
      setDraft,
      turns,
      requests,
      askInstruct,
      askIdeas,
      cancel,
      addTurn: (kind, proposal, anchor) => addTurn(kind, proposal, anchor),
      decideItems,
      undoItem,
      earlier,
      pendingCount,
      clear,
    }),
    [panelOpen, draft, turns, requests, askInstruct, askIdeas, cancel, addTurn, decideItems, undoItem, earlier, pendingCount, clear],
  );
  return <AiSessionContext.Provider value={value}>{children}</AiSessionContext.Provider>;
}
