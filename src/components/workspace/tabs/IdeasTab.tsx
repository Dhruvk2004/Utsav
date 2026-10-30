"use client";

import { Info, Lightbulb, Plus } from "lucide-react";
import { useState } from "react";
import { AiProgress, AiRequestAlert } from "@/components/ai/AiPanel";
import { useAiSession } from "@/components/ai/AiSession";
import { RecordedTag } from "@/components/ai/ProposalBatch";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { IdeaFacts } from "@/components/plan/IdeaFacts";
import { OpEditor } from "@/components/plan/OpEditor";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Choice";
import { ChipGroup, OriginTag, Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { focusById } from "@/components/ui/focus";
import { FlameIcon } from "@/components/ui/icons";
import { addToPlanDraft, ideasUseSummary } from "@/lib/client/ideasView";
import { editFormFor } from "@/lib/client/opForms";
import { DIETARY_LABELS, IDEA_CATEGORY_LABELS } from "@/lib/domain/labels";
import { DIETARY, type Dietary, type IdeaCategory } from "@/lib/domain/model/enums";
import type { IdeaDoc } from "@/lib/domain/model/event";
import { acceptAllDecisions } from "@/lib/plan/proposals";
import { useWorkspace } from "../WorkspaceContext";

const FOCUS: { value: IdeaCategory; label: string }[] = [
  { value: "decor", label: "Decor" },
  { value: "food", label: "Food" },
  { value: "activity", label: "Activities" },
  { value: "favours", label: "Favours" },
  { value: "photo", label: "Photo" },
];

function IdeaCard({ idea }: { idea: IdeaDoc }) {
  const { plan, today, editable, edit, workspace } = useWorkspace();
  const { turns, addTurn } = useAiSession();
  const [editing, setEditing] = useState(false);
  const anchor = `idea:${idea.id}`;
  const planTurn = turns.find((t) => t.anchor === anchor);
  const suggested = idea.state === "suggested";
  const form = editFormFor({ type: "update_idea", ideaId: idea.id, patch: {} }, plan, today);

  if (editing && form) {
    return (
      <li className="rounded-lg border border-line bg-surface p-4">
        <OpEditor
          form={form}
          heading={<h3 className="m-0 text-h3 font-[650]">Edit {idea.title}</h3>}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (op) => {
            const result = await edit([op], undefined, { showsError: true });
            if (result.ok) setEditing(false);
            return result.ok ? null : (result.reason ?? "The idea could not be saved.");
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`grid content-start gap-2 rounded-lg border border-line bg-surface p-4 shadow-1 ${suggested ? "border-l-4 border-l-accent" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="m-0 text-body font-semibold">{idea.title}</h3>
        <Tag tone="neutral">{IDEA_CATEGORY_LABELS[idea.category]}</Tag>
      </div>
      {suggested ? (
        <OriginTag origin="ai">From your new plan</OriginTag>
      ) : (
        idea.origin === "ai" && (idea.source === "library" ? <OriginTag origin="library" /> : <OriginTag origin="ai">AI</OriginTag>)
      )}
      {idea.description && <p className="m-0 text-body-sm">{idea.description}</p>}
      <IdeaFacts idea={idea} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          {suggested ? (
            <>
              <Button size="sm" aria-label={`Save: ${idea.title}`} onClick={() => void edit([{ type: "save_idea", ideaId: idea.id }])}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Dismiss: ${idea.title}`}
                onClick={() => void edit([{ type: "remove_idea", ideaId: idea.id, dismiss: true }])}
              >
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Add to plan: ${idea.title}`}
                onClick={async () => addTurn("code", await workspace.createProposal(addToPlanDraft(plan, idea)), anchor)}
              >
                Add to plan
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Edit: ${idea.title}`} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete: ${idea.title}`}
                onClick={() => void edit([{ type: "remove_idea", ideaId: idea.id }])}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
      {planTurn?.proposal.items.map((item, i) => (
        <SuggestionCard key={`${planTurn.id}-${item.id}`} turn={planTurn} item={item} index={i} headingLevel={4} focusOnMount={i === 0} />
      ))}
    </li>
  );
}

/** The personalisation panel (spec 5.7): what drives ideas; kids and elderly come from Guests once counted. */
function Personalisation() {
  const { plan, edit } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(plan.details.theme);
  const [vibe, setVibe] = useState(plan.details.vibe);
  const [dietary, setDietary] = useState<Dietary[]>(plan.details.dietary);
  const [mobility, setMobility] = useState(plan.flags.mobility);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" aria-expanded={false} onClick={() => setOpen(true)}>
        Edit personalisation
      </Button>
    );
  }
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await edit([{ type: "set_personalisation", theme, vibe, dietary, flags: { mobility } }]);
        if (result.ok) setOpen(false);
      }}
    >
      <h2 className="m-0 text-h3 font-[650]">Personalisation</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField id="idea-theme" label="Theme" optional value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} />
        <TextField id="idea-vibe" label="Vibe" optional value={vibe} maxLength={200} onChange={(e) => setVibe(e.target.value)} />
      </div>
      <ChipGroup
        id="idea-dietary"
        legend="Dietary"
        size="sm"
        options={DIETARY.map((d) => ({ value: d, label: DIETARY_LABELS[d] }))}
        selected={dietary}
        onToggle={(d) => setDietary((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]))}
      />
      <p className="m-0 text-body-sm text-fg-muted">
        Kids and elderly guests: {plan.guests.kids ?? "not counted"} kids, {plan.guests.elderly ?? "not counted"} elderly (set in the Guests
        tab).
      </p>
      <Toggle id="idea-mobility" label="Guests with mobility needs" checked={mobility} onChange={setMobility} />
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Ideas (spec 5.7, 10.11): new AI suggestions live only in their proposal until saved. */
export function IdeasTab() {
  const { plan, today, editable, sample, edit } = useWorkspace();
  const { turns, requests, askIdeas, cancel, decideItems } = useAiSession();
  const announce = useAnnounce();
  const [focus, setFocus] = useState<IdeaCategory[]>([]);
  const [ask, setAsk] = useState("");
  const [adding, setAdding] = useState(false);
  const strip = turns.filter((t) => t.kind === "ideas").at(-1);
  const fromPlan = plan.ideas.filter((idea) => idea.state === "suggested");
  const saved = plan.ideas.filter((idea) => idea.state === "saved");
  const savable = strip ? acceptAllDecisions(plan, strip.proposal, today) : [];
  const addForm = editFormFor(
    {
      type: "add_idea",
      idea: { title: "", description: "", category: "decor", estimatedCost: null, costBasis: "per event", basis: [], effort: "diy" },
    },
    plan,
    today,
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
        <p className="m-0 text-body-sm">
          <b>Ideas use:</b> {ideasUseSummary(plan) || "your event details"}
        </p>
        {editable ? (
          <Personalisation />
        ) : (
          <Tag tone="neutral" icon={<Info aria-hidden="true" />}>
            Sample: try it, changes are not saved
          </Tag>
        )}
      </div>
      <form
        className="grid grid-cols-[minmax(0,1fr)] gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const turn = await askIdeas(focus, ask);
          if (!turn) return;
          // The new suggestions are announced and focused, like an AI mode batch (CO-01).
          const n = turn.proposal.items.length;
          announce(n === 0 ? "No new ideas this time." : `${n} new ${n === 1 ? "idea" : "ideas"}. Not saved until you save them.`);
          if (n > 0) focusById("new-ideas");
        }}
      >
        <ChipGroup
          id="idea-focus"
          legend="Suggest more"
          size="sm"
          options={FOCUS}
          selected={focus}
          onToggle={(v) => setFocus((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]))}
        />
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            id="idea-ask"
            label="Anything specific?"
            optional
            value={ask}
            maxLength={200}
            onChange={(e) => setAsk(e.target.value)}
            className="min-w-[200px] flex-1"
          />
          <Button type="submit" icon={<FlameIcon className="text-accent" />} loading={requests.ideas.status === "loading"}>
            Suggest ideas
          </Button>
        </div>
        {sample && <span className="text-caption text-fg-muted">Sandbox: live AI, or a recorded example when it is busy.</span>}
      </form>
      {requests.ideas.status === "loading" && <AiProgress label="Finding ideas" onCancel={() => cancel("ideas")} />}
      <AiRequestAlert state={requests.ideas} onRetry={() => void askIdeas(focus, ask)} />
      {strip && (
        <section aria-labelledby="new-ideas" className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="new-ideas" tabIndex={-1} className="m-0 text-h3 font-[650] outline-none">
                New suggestions
              </h2>
              <OriginTag origin={strip.proposal.origin === "library" ? "library" : "ai"} />
              {strip.recorded && <RecordedTag reason={strip.recordedReason} />}
            </div>
            {savable.length > 1 && (
              <Button variant="secondary" onClick={() => void decideItems(strip.id, savable)}>
                Save all ({savable.length})
              </Button>
            )}
          </div>
          <p className="m-0 text-caption text-fg-muted">Not saved until you save them.</p>
          <div className="grid grid-cols-1 gap-3 @min-[720px]/workspace:grid-cols-2 @min-[1000px]/workspace:grid-cols-3">
            {strip.proposal.items.map((item, i) => (
              <SuggestionCard key={item.id} turn={strip} item={item} index={i} wording="save" />
            ))}
          </div>
        </section>
      )}
      {fromPlan.length > 0 && (
        <section aria-labelledby="plan-ideas" className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <h2 id="plan-ideas" className="m-0 text-h3 font-[650]">
            From your new plan (not saved yet)
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[720px]/workspace:grid-cols-2">
            {fromPlan.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="saved-ideas" className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="saved-ideas" className="m-0 text-h3 font-[650]">
            Saved ({saved.length})
          </h2>
          {editable && !adding && (
            <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
              Add your own idea
            </Button>
          )}
        </div>
        {adding && addForm && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <OpEditor
              form={addForm}
              heading={<h3 className="m-0 text-h3 font-[650]">Add your own idea</h3>}
              submitLabel="Save idea"
              onCancel={() => setAdding(false)}
              onSubmit={async (op) => {
                const result = await edit([op], undefined, { showsError: true });
                if (result.ok) setAdding(false);
                return result.ok ? null : (result.reason ?? "The idea could not be saved.");
              }}
            />
          </div>
        )}
        {saved.length === 0 ? (
          <EmptyState
            headingLevel={3}
            icon={<Lightbulb aria-hidden="true" />}
            title="No ideas yet"
            body="Ask for ideas that fit your people, or add your own."
            actions={null}
          />
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[720px]/workspace:grid-cols-2">
            {saved.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </ul>
        )}
      </section>
      {plan.dismissedIdeaTitles.length > 0 && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
          Dismissed ideas won&apos;t be suggested again ({plan.dismissedIdeaTitles.length})
          {editable && (
            <Button variant="ghost" size="sm" onClick={() => void edit([{ type: "clear_dismissed_ideas" }])}>
              Clear list
            </Button>
          )}
        </p>
      )}
    </div>
  );
}
