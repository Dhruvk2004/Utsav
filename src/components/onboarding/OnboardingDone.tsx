"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Toran } from "@/components/ui/Motifs";
import { BUDGET_STYLE_LABELS, DIETARY_LABELS, LANGUAGE_LABELS, TRADITION_LABELS } from "@/lib/domain/labels";
import type { UserProfile } from "@/lib/domain/model/user";

/** The rows of the "You're set" summary; unanswered questions read "Not set". */
export function profileSummary(profile: UserProfile): { label: string; value: string }[] {
  const list = (values: string[]) => (values.length ? values.join(", ") : "Not set");
  const traditions = profile.traditions.map((t) =>
    t === "mixed_other" && profile.traditionOther ? profile.traditionOther : TRADITION_LABELS[t],
  );
  return [
    { label: "City", value: profile.homeCity || "Not set" },
    { label: "Language", value: LANGUAGE_LABELS[profile.language] },
    { label: "Traditions", value: list(traditions) },
    { label: "Food", value: list(profile.dietary.map((d) => DIETARY_LABELS[d])) },
    { label: "Budget comfort", value: profile.budgetStyle ? BUDGET_STYLE_LABELS[profile.budgetStyle] : "Not set" },
  ];
}

/** Onboarding's last card, with the toran edge. A re-run says "Profile updated." and returns to Settings. */
export function OnboardingDone({ profile, rerun, onEdit }: { profile: UserProfile; rerun: boolean; onEdit: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const firstName = profile.displayName.split(" ")[0];

  return (
    <section
      aria-labelledby="ob-done"
      className="motion-step-next mx-auto w-full max-w-[480px] overflow-hidden rounded-xl border border-line bg-surface shadow-2"
    >
      <Toran />
      <div className="grid justify-items-start gap-5 px-5 py-7 sm:px-8">
        {!rerun && <Logo variant="mark" className="size-14" />}
        <h1
          id="ob-done"
          ref={headingRef}
          tabIndex={-1}
          className="m-0 font-display text-[1.75rem] leading-tight font-semibold outline-none"
        >
          {rerun ? "Profile updated." : `You're set${firstName ? `, ${firstName}` : ""}.`}
        </h1>
        {rerun ? (
          <>
            <p className="m-0 text-body-sm text-fg-muted">New events will use these answers. Existing events keep their own settings.</p>
            <ButtonLink href="/settings">Back to Settings</ButtonLink>
          </>
        ) : (
          <>
            <div className="w-full rounded-lg bg-surface-sunken p-4">
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm">
                {profileSummary(profile).map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-fg-muted">{row.label}</dt>
                    <dd className="m-0 text-right font-semibold">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 text-right">
                <Button variant="ghost" size="sm" icon={<Pencil size={16} aria-hidden="true" />} onClick={onEdit}>
                  Edit answers
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/events/new" size="lg" icon={<Plus size={16} aria-hidden="true" />}>
                Create your first event
              </ButtonLink>
              <ButtonLink href="/dashboard" variant="secondary" size="lg">
                Go to dashboard
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
