"use client";

import { CalendarHeart, ListChecks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAiSession } from "@/components/ai/AiSession";
import { OpEditor } from "@/components/plan/OpEditor";
import { RushedTag, TaskCheck } from "@/components/plan/TaskCheck";
import { Button, buttonClasses } from "@/components/ui/Button";
import { OriginTag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/Field";
import { FlameIcon } from "@/components/ui/icons";
import { MenuButton } from "@/components/ui/Menu";
import { ProgressBar } from "@/components/ui/Progress";
import { SegmentedControl } from "@/components/ui/Tabs";
import { editFormFor, opDueDate } from "@/lib/client/opForms";
import { TASK_FILTER_LABELS, TASK_FILTERS, timelineGroups, type TaskFilter } from "@/lib/client/timelineView";
import { formatShortDate, formatWeekdayDate } from "@/lib/domain/dates";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import type { TaskView } from "@/lib/domain/view";
import { useWorkspace } from "../WorkspaceContext";

function TaskEditor({ op, title, onDone }: { op: PlanOperation; title: string; onDone: () => void }) {
  const { plan, today, edit } = useWorkspace();
  const form = editFormFor(op, plan, today);
  if (!form) return null;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <OpEditor
        form={form}
        heading={<h3 className="m-0 text-h3 font-[650]">{title}</h3>}
        submitLabel="Save"
        preview={(next) => {
          const due = next.type === "add_task" || next.type === "update_task" ? opDueDate(next, plan.details.eventDate) : null;
          return due ? `Due ${formatWeekdayDate(due)}` : "Pick when it is due.";
        }}
        onCancel={onDone}
        onSubmit={async (next) => {
          const result = await edit([next], undefined, { showsError: true });
          if (result.ok) onDone();
          return result.ok ? null : (result.reason ?? "The task could not be saved.");
        }}
      />
    </div>
  );
}

function TaskRow({ task }: { task: TaskView }) {
  const { plan, editable, edit, today } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const fn = task.functionId ? plan.functions.find((f) => f.id === task.functionId) : undefined;
  if (editing)
    return <TaskEditor op={{ type: "update_task", taskId: task.id }} title={`Edit ${task.title}`} onDone={() => setEditing(false)} />;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 last:border-0 @min-[640px]/workspace:grid-cols-[minmax(0,1fr)_10rem_7rem_auto]">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <TaskCheck task={task} />
        <RushedTag task={task} />
        {task.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
        {fn && <span className="text-caption text-fg-muted">({fn.name})</span>}
      </span>
      <span className="col-start-1 text-caption text-fg-muted @min-[640px]/workspace:col-start-auto @min-[640px]/workspace:text-body-sm">
        {task.category}
      </span>
      <span className="text-body-sm @max-[639px]/workspace:col-start-2 @max-[639px]/workspace:row-start-1">
        {task.done ? "Done" : task.dueDate === today ? "Today" : formatShortDate(task.dueDate)}
      </span>
      {editable ? (
        <MenuButton
          menuLabel={`${task.title} actions`}
          triggerClassName={buttonClasses({ variant: "ghost", size: "sm", iconOnly: true })}
          trigger={
            <>
              <MoreHorizontal size={16} aria-hidden="true" />
              <span className="sr-only">{task.title} actions</span>
            </>
          }
          items={[
            { kind: "action", label: "Edit", icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => setEditing(true) },
            {
              kind: "action",
              label: task.done ? "Mark as to do" : "Mark as done",
              icon: <ListChecks size={16} aria-hidden="true" />,
              onSelect: () => void edit([{ type: "update_task", taskId: task.id, done: !task.done }]),
            },
            {
              kind: "action",
              label: "Delete",
              icon: <Trash2 size={16} aria-hidden="true" />,
              onSelect: () => void edit([{ type: "remove_task", taskId: task.id }]),
            },
          ]}
        />
      ) : (
        <span />
      )}
    </li>
  );
}

/** Timeline (spec 5.5, 10.9): phases from months before to after the event, function days as milestones. */
export function TimelineTab() {
  const { plan, view, editable } = useWorkspace();
  const { openPanel } = useAiSession();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [functionId, setFunctionId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const groups = timelineGroups(plan, view, filter, functionId);
  const { done, total, percent } = view.progress;

  if (plan.tasks.length === 0 && !adding) {
    return (
      <EmptyState
        icon={<ListChecks aria-hidden="true" />}
        title="No tasks yet"
        body="Add the first thing to do, or ask AI what to do this month."
        actions={
          <>
            {editable && <Button onClick={() => setAdding(true)}>Add task</Button>}
            <Button
              variant="secondary"
              icon={<FlameIcon className="text-warning" />}
              onClick={() => openPanel("What should I do this month?")}
            >
              Ask AI
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid max-w-md gap-1.5">
        <span className="text-body-sm font-semibold">
          {done} of {total} done · {percent}%
        </span>
        <ProgressBar label="Tasks done" value={percent} valueText={`${done} of ${total} tasks done`} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl
            name="task-filter"
            label="Show"
            value={filter}
            onChange={setFilter}
            options={TASK_FILTERS.map((f) => ({ value: f, label: TASK_FILTER_LABELS[f] }))}
          />
          {plan.functions.length > 0 && (
            <SelectField
              id="task-function"
              label="Function"
              dense
              value={functionId ?? ""}
              onChange={(e) => setFunctionId(e.target.value || null)}
              options={[{ value: "", label: "All functions" }, ...plan.functions.map((fn) => ({ value: fn.id, label: fn.name }))]}
            />
          )}
        </div>
        {editable && !adding && (
          <Button variant="secondary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add task
          </Button>
        )}
      </div>
      {adding && (
        <TaskEditor
          op={{ type: "add_task", title: "", category: "General", daysBefore: 30 }}
          title="Add a task"
          onDone={() => setAdding(false)}
        />
      )}
      {groups.length === 0 && <p className="m-0 text-body-sm text-fg-muted">No tasks match this filter.</p>}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`phase-${group.id}`} className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <h2 id={`phase-${group.id}`} className="m-0 text-h3 font-[650]">
            {group.label}
          </h2>
          <ul className="m-0 grid list-none rounded-lg border border-line bg-surface p-0">
            {group.entries.map((entry) =>
              entry.kind === "function" ? (
                <li
                  key={entry.fn.id}
                  className="flex items-center gap-2 border-b border-line bg-brand-tint px-3 py-2 text-body-sm font-semibold text-brand last:border-0"
                >
                  <CalendarHeart size={16} aria-hidden="true" />
                  {entry.fn.name} · {entry.when}
                </li>
              ) : (
                <TaskRow key={entry.task.id} task={entry.task} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
