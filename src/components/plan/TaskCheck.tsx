"use client";

import { AlarmClock } from "lucide-react";
import { Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import type { TaskView } from "@/lib/domain/view";

/**
 * The "Rushed" pill (design-system 6.4): the task's ideal date has passed, so it was pulled forward
 * to today. Text and icon, never colour alone; the reason is read to screen readers.
 */
export function RushedTag({ task }: { task: Pick<TaskView, "rushed" | "done"> }) {
  if (task.done || !task.rushed) return null;
  return (
    <Tag tone="warning" icon={<AlarmClock aria-hidden="true" />}>
      Rushed<span className="sr-only">: its ideal date has passed, so it is due today</span>
    </Tag>
  );
}

/**
 * A task's done checkbox (24 px target in dense lists, 44 px rows on touch). Ticking it saves an
 * `update_task` op; in the read-only demo the state is shown as text instead.
 */
export function TaskCheck({ task, className }: { task: TaskView; className?: string }) {
  const { editable, edit } = useWorkspace();
  if (!editable) {
    return (
      <span className={cx("text-body-sm", task.done ? "text-fg-muted line-through" : "text-fg", className)}>
        {task.title}
        <span className="sr-only">{task.done ? " (done)" : " (to do)"}</span>
      </span>
    );
  }
  return (
    <label className={cx("inline-flex min-h-6 cursor-pointer items-center gap-2.5 text-body-sm pointer-coarse:min-h-11", className)}>
      <input
        type="checkbox"
        className="size-5 shrink-0 cursor-pointer accent-brand"
        checked={task.done}
        onChange={(e) => void edit([{ type: "update_task", taskId: task.id, done: e.target.checked }])}
      />
      <span className={cx(task.done && "text-fg-muted line-through")}>{task.title}</span>
    </label>
  );
}
