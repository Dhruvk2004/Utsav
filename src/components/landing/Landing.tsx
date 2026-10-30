import { ArrowRight, Lightbulb, ListChecks, Milestone, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Main } from "@/components/shell/Main";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DiyaIcon, GoogleIcon } from "@/components/ui/icons";
import { Toran } from "@/components/ui/Motifs";
import { HeroPreview } from "./HeroPreview";

/** Landing page (spec 10.1, design.html "Landing"): the hero shows the product, then how it works. */
export function Landing() {
  return (
    <>
      <div className="hero bg-hero-bg text-hero-fg">
        <SiteHeader onHero />
      </div>
      <Main>
        <section aria-labelledby="hero-title" className="hero relative bg-hero-bg pb-3 text-hero-fg">
          <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pt-6 pb-12 sm:px-6 md:pb-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:px-10 lg:pt-12">
            <div className="grid gap-6">
              <p className="m-0 flex items-center gap-2 text-caption font-bold tracking-[0.08em] uppercase">
                <DiyaIcon size={16} />
                Weddings · Birthdays · Community events
              </p>
              <h1
                id="hero-title"
                className="m-0 font-display text-[2.25rem] leading-[1.08] font-semibold tracking-[-0.01em] sm:text-display-xl"
              >
                Plan the celebration, not the chaos.
              </h1>
              <p className="m-0 max-w-[52ch] text-lg opacity-90">
                A budget that always adds up, a timeline counted back from your big day, a vendor checklist you keep for weeks, and ideas
                made for your people.
              </p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/signin" fullLoad variant="google" size="lg" icon={<GoogleIcon />} className="max-sm:w-full">
                  Continue with Google
                </ButtonLink>
                <ButtonLink href="/demo" variant="hero-outline" size="lg" className="max-sm:w-full">
                  See a sample plan, no sign-in
                </ButtonLink>
              </div>
              <p className="m-0 text-body-sm opacity-80">AI suggests. Utsav checks the numbers. You decide.</p>
            </div>
            <HeroPreview />
          </div>
          <Toran className="absolute inset-x-0 bottom-0" />
        </section>

        <section aria-labelledby="how-it-works" className="mx-auto grid w-full max-w-[1200px] gap-7 px-4 py-12 sm:px-6 lg:px-10">
          <h2 id="how-it-works" className="m-0 scroll-mt-4 font-display text-h1 font-semibold">
            How it works
          </h2>
          <ol className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
            <Step n={1} title="Tell us about the event" body="Type, date, city, guests, budget and who it's for. About a minute." />
            <Step n={2} title="Get a plan you can edit" body="Budget, timeline, vendor checklist and ideas, saved to your account." />
            <Step n={3} title="Ask AI, then accept or decline" body={'"Move the sangeet to Friday." Every change is a card you review.'} />
          </ol>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon={<Wallet />}
              title="Budget that adds up"
              body="Split by category and by function. Totals computed in code, to the rupee."
            />
            <Feature icon={<Milestone />} title="Timeline counted back" body="From the big day back to today, with rushed items flagged." />
            <Feature
              icon={<ListChecks />}
              title="Vendor checklist"
              body="To research → contacted → quoted → booked → paid, with notes and amounts."
            />
            <Feature
              icon={<Lightbulb />}
              title="Ideas for your people"
              body="A Peppa Pig corner for a 6-year-old, a rangoli contest for your society."
            />
          </ul>
          <Alert tone="info" title="AI suggests. Utsav checks the numbers. You decide.">
            Costs are estimates. We never list or recommend specific businesses.
          </Alert>
          <p className="m-0">
            <Link href="/demo" className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand underline underline-offset-2">
              See a sample plan, no sign-in needed
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </p>
        </section>
      </Main>
    </>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="grid content-start gap-2">
      <span className="grid size-9 place-items-center rounded-full bg-brand-tint font-bold text-brand" aria-hidden="true">
        {n}
      </span>
      <h3 className="m-0 text-body font-semibold">
        <span className="sr-only">Step {n}: </span>
        {title}
      </h3>
      <p className="m-0 text-body-sm text-fg-muted">{body}</p>
    </li>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li>
      <Card className="grid h-full content-start gap-2">
        <span className="text-brand [&_svg]:size-6" aria-hidden="true">
          {icon}
        </span>
        <h3 className="m-0 text-body font-semibold">{title}</h3>
        <p className="m-0 text-body-sm text-fg-muted">{body}</p>
      </Card>
    </li>
  );
}
