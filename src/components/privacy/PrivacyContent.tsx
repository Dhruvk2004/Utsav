import type { ReactNode } from "react";
import { PRIVACY_CONTACT } from "@/lib/site";

/**
 * Privacy and AI (spec 9.4, 10.16). The deletion copy states only what exists: per-event delete and
 * account deletion by email (P0). `selfServeDeletion` switches it to the Settings control once
 * F-20 ships.
 */
export function PrivacyContent({ selfServeDeletion = false }: { selfServeDeletion?: boolean }) {
  const mail = (
    <a href={`mailto:${PRIVACY_CONTACT}`} className="text-brand underline underline-offset-2">
      {PRIVACY_CONTACT}
    </a>
  );
  return (
    <article className="prose-links mx-auto grid w-full max-w-[720px] gap-6 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="m-0 font-display text-h1 font-semibold">Privacy and AI</h1>
        <p className="m-0 text-fg-muted">Plain answers to what Utsav keeps, what it sends to Google Gemini, and how to delete it.</p>
      </header>
      <Section id="store" title="What we store">
        Your Google name, photo and email (from sign-in), your profile answers, and your events: budget, timeline, vendor checklist, ideas
        and guest counts. Guest counts only, never guest names or phone numbers. Vendor labels and contacts you type are visible only to
        you. Your data is stored in Mumbai (asia-south1). The only cookie is the sign-in session cookie; there are no analytics cookies.
      </Section>
      <Section id="gemini" title="What we send to Gemini">
        Event type, occasion and milestone, date, city, guest counts, budget lines, functions, tasks, vendor categories and statuses,
        tradition, dietary needs, and honorees&apos; roles, ages and interests. <b>Never</b> names, private notes, event titles, vendor
        labels or contacts. Calls go through Google Cloud Vertex AI (global endpoint), which does not train on your data. Every AI change is
        a suggestion you accept or decline; Utsav&apos;s code checks the numbers first.
      </Section>
      <Section id="never" title="What we never do">
        Sell your data, send messages for you, or list or recommend specific businesses. Costs are rough estimates, not quotes.
      </Section>
      <Section id="delete" title="Delete your data">
        You can delete any event and everything in it from its Event settings.{" "}
        {selfServeDeletion ? (
          <>
            Delete your account in {/* A full load: this page's stricter CSP must not follow into the app (src/lib/server/csp.ts). */}
            <a href="/settings">Settings</a>.
          </>
        ) : (
          <>To delete your whole account, email {mail} and we will do it within 30 days.</>
        )}
      </Section>
      <Section id="contact" title="Contact">
        Questions about your data: {mail}
      </Section>
    </article>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-4 gap-1.5">
      <h2 id={`${id}-title`} className="m-0 text-h3 font-[650]">
        {title}
      </h2>
      <p className="m-0 text-body-sm leading-relaxed">{children}</p>
    </section>
  );
}
