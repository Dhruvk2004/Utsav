"use client";

import { CalendarPlus, Copy, Link2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { WhatIfSheet } from "@/components/plan/WhatIfSheet";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Choice";
import { SelectField, TextField } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { focusById } from "@/components/ui/focus";
import { datePreview, datePreviewText, detailsFormOf, detailsIssues, detailsOp, type DetailsForm } from "@/lib/client/eventSettings";
import { HOME_PATH } from "@/lib/client/navigation";
import { ApiRequestError } from "@/lib/data/api";
import type { EventControls } from "@/lib/data/workspaces";
import { formatInr } from "@/lib/domain/budget";
import { defaultEventTitle, LANGUAGE_LABELS } from "@/lib/domain/labels";
import { useWorkspace } from "./WorkspaceContext";

/**
 * Event settings (spec 5.9, 10.13): edit the details with a date-change preview, change the budget
 * through What-if, the read-only share link, "Add to calendar" and deleting the event.
 */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:p-5">
      <section aria-labelledby={id} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h3 id={id} className="m-0 text-h3 font-[650]">
          {title}
        </h3>
        {children}
      </section>
    </Card>
  );
}

function DetailsSection() {
  const { plan, today, edit } = useWorkspace();
  const [form, setForm] = useState<DetailsForm>(() => detailsFormOf(plan));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = submitted ? detailsIssues(form, today) : {};
  const preview = datePreview(plan, form.eventDate, today);
  const set = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (Object.keys(detailsIssues(form, today)).length > 0) return;
    const op = detailsOp(plan, form);
    if (!op) return;
    const result = await edit([op], "Event details", { showsError: true });
    if (!result.ok) setError(result.reason ?? "The details could not be saved.");
  }

  return (
    <Section id="settings-details" title="Details">
      <form noValidate onSubmit={(e) => void save(e)} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <TextField
          id="settings-title"
          label="Event name"
          optional
          hint={`Shown only to you. Left empty, it reads “${defaultEventTitle(plan.details)}”.`}
          value={form.title}
          maxLength={80}
          error={issues.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <TextField
          id="settings-date"
          type="date"
          label="Event date"
          value={form.eventDate}
          error={issues.eventDate}
          onChange={(e) => set("eventDate", e.target.value)}
        />
        {preview && (
          <p id="settings-date-preview" role="status" className="m-0 rounded-md bg-surface-sunken px-3 py-2 text-body-sm">
            {datePreviewText(preview, form.eventDate)}
          </p>
        )}
        <TextField
          id="settings-city"
          label="City"
          value={form.city}
          maxLength={60}
          error={issues.city}
          onChange={(e) => set("city", e.target.value)}
        />
        <SelectField
          id="settings-language"
          label="Language for AI text"
          hint="Ideas, tasks and enquiry drafts are written in this language."
          value={form.language}
          onChange={(e) => set("language", e.target.value === "hi" ? "hi" : "en")}
          options={[
            { value: "en", label: LANGUAGE_LABELS.en },
            { value: "hi", label: LANGUAGE_LABELS.hi },
          ]}
        />
        {error && (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="justify-self-start" disabled={detailsOp(plan, form) === null || Boolean(preview?.problem)}>
          Save details
        </Button>
      </form>
    </Section>
  );
}

function BudgetSection() {
  const { plan } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <Section id="settings-budget" title="Budget">
      <p className="m-0 text-body-sm">
        Total <b className="num">{formatInr(plan.budget.total)}</b>. Changing it shows what each category becomes before anything is saved.
      </p>
      <Button variant="secondary" className="justify-self-start" onClick={() => setOpen(true)}>
        Change the total in What if?
      </Button>
      {open && <WhatIfSheet open onClose={() => setOpen(false)} />}
    </Section>
  );
}

function ShareSection({ manage }: { manage: EventControls }) {
  const { plan } = useWorkspace();
  const announce = useAnnounce();
  const [options, setOptions] = useState({ showAmounts: plan.share.showAmounts, showNotes: plan.share.showNotes });
  const [active, setActive] = useState(plan.share.active);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const share = (next = options) =>
    run(async () => {
      const created = !active;
      setUrl(await manage.share(next));
      setActive(true);
      // The new link is announced and focused (its text is selected), ready to copy (CO-01).
      announce(created ? "Link created. It is in the Link field." : "Link updated.");
      focusById("share-url");
    });

  return (
    <Section id="settings-share" title="Share a read-only link">
      <p className="m-0 text-body-sm text-fg-muted">
        Anyone with the link sees the plan without signing in. Contact details are never shown.
      </p>
      <Toggle
        id="share-amounts"
        label="Show amounts"
        checked={options.showAmounts}
        onChange={(showAmounts) => setOptions((o) => ({ ...o, showAmounts }))}
      />
      <Toggle
        id="share-notes"
        label="Show vendor notes"
        checked={options.showNotes}
        onChange={(showNotes) => setOptions((o) => ({ ...o, showNotes }))}
      />
      {url && (
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            id="share-url"
            label="Link"
            readOnly
            value={url}
            className="min-w-0 flex-1"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="secondary"
            className="self-end"
            icon={<Copy size={16} aria-hidden="true" />}
            onClick={async () => {
              await navigator.clipboard?.writeText(url);
              announce("Link copied");
            }}
          >
            Copy link
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} icon={<Link2 size={16} aria-hidden="true" />} onClick={() => void share()}>
          {active ? (url ? "Update link options" : "Show the link") : "Create link"}
        </Button>
        {active && (
          <Button
            variant="danger-outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await manage.revokeShare();
                setActive(false);
                setUrl(null);
                announce("Link turned off. It no longer opens the plan.");
              })
            }
          >
            Turn off link
          </Button>
        )}
      </div>
    </Section>
  );
}

function DeleteSection({ manage }: { manage: EventControls }) {
  const { plan } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const title = plan.details.title || defaultEventTitle(plan.details);

  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await manage.remove(typed);
      router.push(HOME_PATH);
    } catch (failure) {
      const field =
        failure instanceof ApiRequestError
          ? (failure.body.error as { fields?: Record<string, string> } | undefined)?.fields?.confirmTitle
          : undefined;
      setError(field ?? "The event could not be deleted. Try again.");
      setBusy(false);
    }
  }

  return (
    <Section id="settings-delete" title="Delete this event">
      <p className="m-0 text-body-sm">Deletes the plan, its history, suggestions and share link for good. This cannot be undone.</p>
      <Button
        variant="danger-outline"
        className="justify-self-start"
        icon={<Trash2 size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Delete event
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this event?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" form={formId} loading={busy} disabled={typed.trim() !== title}>
              Delete for good
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(e) => void remove(e)} className="grid gap-3">
          <TextField
            id="delete-confirm"
            label={`Type “${title}” to confirm`}
            value={typed}
            error={error ?? undefined}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
        </form>
      </Dialog>
    </Section>
  );
}

export function EventSettings() {
  const { workspace } = useWorkspace();
  const { manage } = workspace;
  return (
    <div className="mx-auto grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-4">
      <h2 className="m-0 text-h2 font-semibold">Event settings</h2>
      <DetailsSection />
      <BudgetSection />
      {manage && (
        <>
          <ShareSection manage={manage} />
          <Section id="settings-calendar" title="Add to calendar">
            <p className="m-0 text-body-sm text-fg-muted">
              A calendar file with the event, each function (with times when set), open tasks and booking deadlines.
            </p>
            <a
              href={manage.calendarHref}
              download
              className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md border border-line-strong px-4 text-body-sm font-semibold text-brand no-underline"
            >
              <CalendarPlus size={16} aria-hidden="true" />
              Download .ics
            </a>
          </Section>
          <DeleteSection manage={manage} />
        </>
      )}
    </div>
  );
}
