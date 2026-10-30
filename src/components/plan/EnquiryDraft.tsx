"use client";

import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { Checkbox, RadioGroup } from "@/components/ui/Choice";
import { OriginTag, Tag } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/Field";
import { focusById } from "@/components/ui/focus";
import { FlameIcon } from "@/components/ui/icons";
import { TextareaField } from "@/components/ui/TextareaField";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import type { EnquiryDraft as Draft } from "@/lib/data/aiClient";
import { formatShortDate } from "@/lib/domain/dates";
import { DRAFT_LIMITS, shareLink, type EnquiryOptions } from "@/lib/domain/enquiry";
import { LANGUAGE_LABELS } from "@/lib/domain/labels";
import { CAPS, type VendorDoc } from "@/lib/domain/model/event";

const CHANNEL_LABELS = { whatsapp: "WhatsApp", email: "Email" } as const;

/**
 * Vendor enquiry drafts (spec 6.6, design-system 6.16): pick channel, language and tone, get a
 * draft to edit, then copy it or open it in the user's own WhatsApp or email. Utsav never sends
 * anything. Up to three drafts are saved on the vendor.
 */
export function EnquiryDraft({ vendor }: { vendor: VendorDoc }) {
  const { workspace, plan, edit, editable } = useWorkspace();
  const announce = useAnnounce();
  const [options, setOptions] = useState<EnquiryOptions>({
    channel: "whatsapp",
    language: plan.details.language,
    tone: "warm",
    includeBudget: false,
    questions: vendor.questions,
    signWithName: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState({ subject: "", body: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = draft !== null && (text.body !== draft.body || text.subject !== draft.subject);
  const set = <K extends keyof EnquiryOptions>(key: K, value: EnquiryOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const next = await workspace.ai.enquiry(vendor.id, options);
      setDraft(next);
      setText({ subject: next.subject, body: next.body });
      // The draft is announced and focused so it can be read and edited straight away (CO-01).
      announce(`${next.origin === "ai" ? "Draft" : "Template draft"} ready. Review it before sending.`);
      focusById(options.channel === "email" ? "enquiry-subject" : "enquiry-body");
    } catch {
      setError("A draft could not be made right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const generated = draft?.generatedDraftId ? { generatedDraftId: draft.generatedDraftId } : {};
    const result = await edit(
      [
        {
          type: "save_draft",
          vendorId: vendor.id,
          draft: { channel: options.channel, language: options.language, subject: text.subject, body: text.body },
          ...generated,
        },
      ],
      undefined,
      { showsError: true },
    );
    if (!result.ok) setError(result.reason ?? "The draft could not be saved.");
  }

  return (
    <section aria-labelledby="enquiry-heading" className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-line pt-4">
      <h3 id="enquiry-heading" className="m-0 text-h3 font-[650]">
        Enquiry draft
      </h3>
      <RadioGroup
        name="enquiry-channel"
        legend="Channel"
        value={options.channel}
        onChange={(v) => set("channel", v)}
        options={[
          { value: "whatsapp", label: "WhatsApp" },
          { value: "email", label: "Email" },
        ]}
      />
      <RadioGroup
        name="enquiry-language"
        legend="Language"
        value={options.language}
        onChange={(v) => set("language", v)}
        options={[
          { value: "en", label: "English" },
          { value: "hi", label: "हिन्दी (Hindi)", lang: "hi" },
        ]}
      />
      <RadioGroup
        name="enquiry-tone"
        legend="Tone"
        value={options.tone}
        onChange={(v) => set("tone", v)}
        options={[
          { value: "warm", label: "Warm" },
          { value: "formal", label: "Formal" },
        ]}
      />
      <Checkbox
        id="enquiry-budget"
        label="Include our budget for this"
        hint="Off by default: sharing a budget can weaken your bargaining."
        checked={options.includeBudget}
        onChange={(v) => set("includeBudget", v)}
      />
      {editable && (
        <Checkbox
          id="enquiry-sign"
          label="Sign with my first name"
          hint="Added after the draft is written; your name is not sent to the AI."
          checked={options.signWithName ?? false}
          onChange={(v) => set("signWithName", v)}
        />
      )}
      <Button
        variant="secondary"
        className="justify-self-start"
        loading={loading}
        icon={<FlameIcon className="text-warning" />}
        onClick={() => void generate()}
      >
        {draft ? "Regenerate" : "Draft enquiry"}
      </Button>
      {error && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      )}
      {draft && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-body-sm">Draft - review before sending</b>
            {draft.origin === "ai" ? <OriginTag origin="ai">AI</OriginTag> : <Tag tone="neutral">Template draft</Tag>}
            {edited && <OriginTag origin="you" />}
          </div>
          {draft.filtered && (
            <p className="m-0 text-caption text-fg-muted">
              Some details were removed: Utsav never adds phone numbers, links or business names.
            </p>
          )}
          {options.channel === "email" && (
            <TextField
              id="enquiry-subject"
              label="Subject"
              value={text.subject}
              maxLength={120}
              onChange={(e) => setText((t) => ({ ...t, subject: e.target.value }))}
            />
          )}
          <TextareaField
            id="enquiry-body"
            label="Message · edit it before you copy or open it"
            value={text.body}
            maxLength={DRAFT_LIMITS[options.channel]}
            rows={8}
            lang={options.language}
            onChange={(e) => setText((t) => ({ ...t, body: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Copy size={16} aria-hidden="true" />}
              onClick={async () => {
                await navigator.clipboard?.writeText(text.body);
                announce("Draft copied");
              }}
            >
              Copy
            </Button>
            <a
              href={shareLink(options.channel, text)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-body-sm font-semibold text-brand no-underline"
            >
              {options.channel === "whatsapp" ? "Open in WhatsApp" : "Open email"}
            </a>
            <Button disabled={vendor.drafts.length >= CAPS.drafts || text.body.trim() === ""} onClick={() => void save()}>
              Save draft
            </Button>
          </div>
          {vendor.drafts.length >= CAPS.drafts && (
            <p className="m-0 text-caption text-fg-muted">Keep at most {CAPS.drafts} drafts; delete one to save another.</p>
          )}
        </div>
      )}
      {vendor.drafts.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <h4 className="m-0 text-body-sm font-semibold">Saved drafts ({vendor.drafts.length})</h4>
          <ul className="m-0 grid list-none gap-1 p-0">
            {vendor.drafts.map((saved, i) => {
              // Numbered, so two drafts saved on the same day still have distinct names (QA-16).
              const name = `draft ${i + 1}, ${CHANNEL_LABELS[saved.channel]}, ${LANGUAGE_LABELS[saved.language]}, ${formatShortDate(saved.createdAt.slice(0, 10))}`;
              return (
                <li key={saved.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                  <span className="flex-1">
                    {CHANNEL_LABELS[saved.channel]} · {LANGUAGE_LABELS[saved.language]} · {formatShortDate(saved.createdAt.slice(0, 10))}
                    {saved.origin === "template" && " · Template draft"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOptions((o) => ({ ...o, channel: saved.channel, language: saved.language }));
                      setDraft({ subject: saved.subject, body: saved.body, origin: saved.origin === "ai" ? "ai" : "template" });
                      setText({ subject: saved.subject, body: saved.body });
                    }}
                  >
                    View <span className="sr-only">{name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={`Delete ${name}`}
                    onClick={() => void edit([{ type: "remove_draft", vendorId: vendor.id, draftId: saved.id }])}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
