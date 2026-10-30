import { PageColumn } from "@/components/shell/Main";
import { ButtonLink } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { FlameIcon } from "@/components/ui/icons";
import { DEMO_CHIP, demoTabHref } from "@/lib/client/workspace";
import type { DemoSample } from "@/lib/demo/resolveDates";

/** The three samples, one per event type the brief names (spec 5.10c). */
const CARDS: { sample: DemoSample; title: string; meta: string; tryText: string; action: string; href: string }[] = [
  {
    sample: "wedding",
    title: "Wedding · Pune",
    meta: "350 guests · 5 functions · ₹25,00,000",
    tryText: DEMO_CHIP.wedding,
    action: "Open sample wedding",
    href: `${demoTabHref("wedding", "budget")}&ai=${encodeURIComponent(DEMO_CHIP.wedding)}`,
  },
  {
    sample: "birthday",
    title: "6th birthday · Bengaluru",
    meta: "40 guests · loves Peppa Pig · ₹60,000",
    tryText: "Suggest ideas",
    action: "Open sample birthday",
    href: demoTabHref("birthday", "ideas"),
  },
  {
    sample: "community",
    title: "Diwali · Chennai",
    meta: "600 residents · volunteer-run · ₹2,00,000",
    tryText: "Suggest ideas",
    action: "Open sample community event",
    href: demoTabHref("community", "ideas"),
  },
];

/** `/demo` (spec 10.19): try Utsav without signing in. */
export function DemoChooser() {
  return (
    <PageColumn className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-display text-h1 font-semibold">Try Utsav without signing in</h1>
        <p className="m-0 text-fg-muted">Open a sample plan and ask AI to change it. Every change is a card you accept or decline.</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-3">
        {CARDS.map((card) => (
          <li key={card.sample} className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5 shadow-1">
            <Tag tone="warning">Sample plan</Tag>
            <h2 className="m-0 text-h2 font-bold">{card.title}</h2>
            <p className="m-0 text-body-sm text-fg-muted">{card.meta}</p>
            <p className="m-0 flex items-center gap-1.5 text-body-sm">
              <FlameIcon size={16} className="text-warning" />
              Try: &ldquo;{card.tryText}&rdquo;
            </p>
            <ButtonLink href={card.href} className="justify-self-start">
              {card.action}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </PageColumn>
  );
}
