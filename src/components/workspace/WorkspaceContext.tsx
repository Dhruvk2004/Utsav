"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useOnline } from "@/components/data/useOnline";
import { useAnnounce } from "@/components/ui/Announcer";
import { useToast } from "@/components/ui/Toast";
import type { WorkspaceTab } from "@/lib/client/workspace";
import type { Workspace } from "@/lib/data/workspaces";
import type { DemoSample } from "@/lib/demo/resolveDates";
import { announceChange } from "@/lib/domain/announce";
import { describeOperation } from "@/lib/domain/describe";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, Proposal } from "@/lib/domain/model/records";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { deriveView, type PlanView } from "@/lib/domain/view";
import { UNDO_STALE_MESSAGE } from "@/lib/plan/commands";
import type { ApplyResult, DecideResult } from "@/lib/plan/PlanStore";

/**
 * The open event as every workspace component sees it (spec 5.10 `PlanStore`): the current plan
 * and its derived view, whether tab editors are offered (not in the demo), and the three ways
 * the plan changes. Each change that applied is a numbered batch, so a card or toast can tell
 * whether its Undo still reverts the latest change.
 */
export interface WorkspaceValue {
  workspace: Workspace;
  plan: EventDoc;
  view: PlanView;
  today: string;
  editable: boolean;
  /** The signed-in workspace has lost its connection: edits are refused and controls disabled (spec 3.4). */
  offline: boolean;
  sample: DemoSample | null;
  tab: WorkspaceTab;
  /** Event settings is open, so no tab is current. */
  onSettings: boolean;
  tabs: readonly WorkspaceTab[];
  tabHref: (tab: WorkspaceTab) => string;
  /**
   * Manual edits: applies, announces the outcome and offers Undo in a toast. A failed edit (a version
   * conflict, a refusal, a network or server error) is reported in a toast too (spec 3.4), unless the
   * caller shows the reason next to its own form (`showsError`).
   */
  edit: (ops: PlanOperation[], message?: string, options?: EditOptions) => Promise<ApplyResult>;
  /**
   * Card decisions; `batch` is set when the decisions changed the plan. A request that failed as a
   * whole (offline, network, server, conflict) is reported in a toast unless `showsError` (QA-03).
   */
  decide: (proposal: Proposal, decisions: Decision[], options?: EditOptions) => Promise<{ result: DecideResult; batch: number | null }>;
  /** Records a change made outside `edit` and `decide` (the review banner's template restore). */
  track: () => number;
  /**
   * Reverts `batch` if it is still the latest change; any failure is reported in a toast (QA-17).
   * A second call for a batch whose undo is still in flight is ignored (QA-20).
   */
  undo: (batch: number, options?: UndoOptions) => Promise<boolean>;
  latestBatch: number | null;
  /** The batch whose undo is in flight, so its Undo button shows busy and takes no second click (QA-20). */
  undoing: number | null;
}

export interface EditOptions {
  /** The caller renders `result.reason` itself (a form's error), so no failure toast is shown. */
  showsError?: boolean;
}

export interface UndoOptions {
  /**
   * The caller's Undo control is gone (the Saved toast closes on click), so a failure toast offers
   * "Try again" while the store still holds the change (QA-17). Cards keep their own Undo instead.
   */
  offerRetry?: boolean;
}

/** Shown when a failed edit carries no reason of its own. */
export const EDIT_FAILED_MESSAGE = "Your change wasn't saved. Try again.";

/** Spec 3.4's offline banner; also the reason an edit made offline is refused. */
export const OFFLINE_MESSAGE = "You are offline. Changes will not be saved.";

/** Shown when a failed undo carries no reason of its own. */
export const UNDO_FAILED_MESSAGE = "Couldn't undo that change. Try again.";

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

interface ProviderProps {
  workspace: Workspace;
  editable: boolean;
  sample?: DemoSample;
  tab: WorkspaceTab;
  onSettings?: boolean;
  tabs: readonly WorkspaceTab[];
  tabHref: (tab: WorkspaceTab) => string;
  children: ReactNode;
}

export function WorkspaceProvider({ workspace, editable, sample, tab, onSettings = false, tabs, tabHref, children }: ProviderProps) {
  const { store, today } = workspace;
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getPlan = useCallback(() => store.getPlan(), [store]);
  const plan = useSyncExternalStore(subscribe, getPlan, getPlan);
  const view = useMemo(() => deriveView(plan, today), [plan, today]);
  const announce = useAnnounce();
  const toast = useToast();
  // Only the server-backed workspace needs the network to save; the demo sandbox is in memory.
  const offline = !useOnline() && store.mode === "server";
  const [batches, setBatches] = useState<number[]>([]);
  const stack = useRef<number[]>([]);
  const counter = useRef(0);
  const [undoing, setUndoing] = useState<number | null>(null);
  const undoingRef = useRef<number | null>(null);
  // Changes run one after another (QA-19), so an Undo clicked while a decision is still saving
  // checks "is this still the latest change?" only once that decision has its batch.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(change: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(change);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const track = useCallback(() => {
    const batch = ++counter.current;
    stack.current = [...stack.current, batch];
    setBatches(stack.current);
    return batch;
  }, []);

  /**
   * Batches mirror the store's undo entries one for one. The store can drop entries without an
   * undo (a version conflict clears them, a refused undo drops one), so after a failure the
   * newest batches go too and their Undo buttons disappear instead of reverting something else.
   */
  const syncHistory = useCallback(() => {
    const depth = store.undoDepth();
    if (stack.current.length <= depth) return;
    stack.current = stack.current.slice(0, depth);
    setBatches(stack.current);
  }, [store]);

  const fail = useCallback((message: string) => toast({ message, kind: "info" }), [toast]);

  const undoNow = useCallback(
    async (batch: number, retry?: () => void) => {
      if (stack.current.at(-1) !== batch) {
        fail(UNDO_STALE_MESSAGE);
        return false;
      }
      const result: ApplyResult = offline ? { ok: false, plan: store.getPlan(), results: [], reason: OFFLINE_MESSAGE } : await store.undo();
      if (!result.ok) {
        syncHistory();
        const message = result.reason ?? UNDO_FAILED_MESSAGE;
        // The store kept the entry (a network or server failure, or offline), so the change can
        // still be undone: a caller whose own Undo has gone gets "Try again" here (QA-17).
        const kept = stack.current.at(-1) === batch;
        toast(retry && kept ? { message, kind: "info", action: { label: "Try again", onAction: retry } } : { message, kind: "info" });
        return false;
      }
      stack.current = stack.current.slice(0, -1);
      setBatches(stack.current);
      syncHistory();
      announce("Undone. The plan is back as it was.");
      return true;
    },
    [store, offline, syncHistory, fail, toast, announce],
  );

  // "Try again" calls the latest `undo` (it is created before `undo` itself exists).
  const retryUndo = useRef<(batch: number, options?: UndoOptions) => Promise<boolean>>(async () => false);
  const undo = useCallback(
    async (batch: number, options: UndoOptions = {}): Promise<boolean> => {
      // A double click, or Undo pressed again while the first is saving, sends one request (QA-20).
      if (undoingRef.current === batch) return false;
      undoingRef.current = batch;
      setUndoing(batch);
      try {
        const retry = options.offerRetry ? () => void retryUndo.current(batch, options) : undefined;
        return await serial(() => undoNow(batch, retry));
      } finally {
        undoingRef.current = null;
        setUndoing(null);
      }
    },
    [serial, undoNow],
  );
  useLayoutEffect(() => {
    retryUndo.current = undo;
  });

  const edit = useCallback(
    async (ops: PlanOperation[], message?: string, options: EditOptions = {}) => {
      // The batch is numbered inside the queue, so a queued Undo sees it as the latest change.
      const { before, result, batch } = await serial(async () => {
        const before = store.getPlan();
        const result: ApplyResult = offline
          ? { ok: false, plan: before, results: [], reason: OFFLINE_MESSAGE }
          : await store.applyManual(ops);
        if (!result.ok) syncHistory();
        return { before, result, batch: result.ok ? track() : null };
      });
      if (batch === null) {
        if (!options.showsError) fail(result.reason ?? EDIT_FAILED_MESSAGE);
        return result;
      }
      announce(ops.length === 1 ? announceChange(before, result.plan, ops[0], today) : "Saved.");
      const title = message ?? describeOperation(before, result.plan, ops[0], today).title;
      toast({ message: `Saved: ${title}`, action: { label: "Undo", onAction: () => void undo(batch, { offerRetry: true }) } });
      return result;
    },
    [store, today, offline, serial, track, syncHistory, fail, announce, toast, undo],
  );

  const decide = useCallback(
    (proposal: Proposal, decisions: Decision[], options: EditOptions = {}) =>
      serial(async () => {
        const result: DecideResult = offline
          ? refused(store.getPlan(), proposal, decisions, OFFLINE_MESSAGE)
          : await store.decide(proposal, decisions);
        if (result.reason !== undefined) {
          syncHistory();
          if (!options.showsError) fail(result.reason);
        }
        const changed = result.results.some((r) => r.ok && (r.status === "accepted" || r.status === "edited"));
        return { result, batch: changed ? track() : null };
      }),
    [store, offline, serial, track, syncHistory, fail],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      workspace,
      plan,
      view,
      today,
      editable,
      offline,
      sample: sample ?? null,
      tab,
      onSettings,
      tabs,
      tabHref,
      edit,
      decide,
      track,
      undo,
      latestBatch: batches.at(-1) ?? null,
      undoing,
    }),
    [workspace, plan, view, today, editable, offline, sample, tab, onSettings, tabs, tabHref, edit, decide, track, undo, batches, undoing],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Decisions refused before any request, each with the same reason. */
function refused(plan: EventDoc, proposal: Proposal, decisions: Decision[], reason: string): DecideResult {
  return { plan, proposal, results: decisions.map((d) => ({ itemId: d.itemId, ok: false, reason })), reason };
}
