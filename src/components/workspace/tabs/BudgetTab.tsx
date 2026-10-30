"use client";

import { Lock, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { OpEditor } from "@/components/plan/OpEditor";
import { WhatIfSheet } from "@/components/plan/WhatIfSheet";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/Choice";
import { Tag } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/Tabs";
import type { RebalanceMode } from "@/lib/client/budgetTable";
import { editFormFor } from "@/lib/client/opForms";
import { formatInr } from "@/lib/domain/budget";
import { useWorkspace } from "../WorkspaceContext";
import { CategoryTable } from "./BudgetTable";
import { FunctionTable } from "./FunctionShares";

type View = "category" | "function";

function AddCategory() {
  const { plan, today, edit } = useWorkspace();
  const [open, setOpen] = useState(false);
  const form = editFormFor({ type: "add_budget_category", category: "", amount: 0, fundFrom: "contingency" }, plan, today);
  if (!open || !form) {
    return (
      <Button variant="secondary" className="justify-self-start" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setOpen(true)}>
        Add category
      </Button>
    );
  }
  return (
    <div className="max-w-xl rounded-lg border border-line bg-surface p-4">
      <OpEditor
        form={form}
        heading={<h3 className="m-0 text-h3 font-[650]">Add a category</h3>}
        submitLabel="Add category"
        onCancel={() => setOpen(false)}
        onSubmit={async (op) => {
          const result = await edit([op], undefined, { showsError: true });
          if (result.ok) setOpen(false);
          return result.ok ? null : (result.reason ?? "The category could not be added.");
        }}
      />
    </div>
  );
}

/** Budget tab (spec 5.4, 10.8). In the demo the tables are read-only and What if? applies to the sample. */
export function BudgetTab() {
  const { plan, editable } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<RebalanceMode>("keep_total");
  const [whatIf, setWhatIf] = useState(false);
  const multiFunction = plan.functions.length > 1;
  const view: View = multiFunction && params.get("view") === "functions" ? "function" : "category";

  function setView(next: View) {
    const query = new URLSearchParams(params.toString());
    if (next === "function") query.set("view", "functions");
    else query.delete("view");
    router.replace(`?${query.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body-sm text-fg-muted">Total budget</span>
          <span className="num text-[1.75rem] leading-none font-bold">{formatInr(plan.budget.total)}</span>
          <Button variant="secondary" size="sm" onClick={() => setWhatIf(true)}>
            {editable ? "Change total / What if?" : "What if?"}
          </Button>
        </div>
        {multiFunction && (
          <SegmentedControl
            name="budget-view"
            label="Budget view"
            value={view}
            onChange={setView}
            options={[
              { value: "category", label: "By category" },
              { value: "function", label: "By function" },
            ]}
          />
        )}
      </div>
      {!editable && (
        <Tag tone="neutral" icon={<Lock aria-hidden="true" />}>
          Read-only in the sample · change it with AI mode
        </Tag>
      )}
      {view === "function" ? <FunctionTable /> : <CategoryTable mode={mode} />}
      {editable && view === "category" && (
        <>
          <RadioGroup
            name="rebalance-mode"
            legend="When you change one amount"
            value={mode}
            onChange={setMode}
            options={[
              { value: "keep_total", label: "Adjust the others to keep the total" },
              { value: "change_total", label: "Change the total" },
            ]}
          />
          <AddCategory />
        </>
      )}
      {whatIf && <WhatIfSheet open onClose={() => setWhatIf(false)} />}
    </div>
  );
}
