import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { OriginTag, Tag } from "@/components/ui/Chip";

const ROWS = [
  ["Venue", "20", "₹5,00,000"],
  ["Catering", "32", "₹8,00,000"],
  ["Decor", "12", "₹3,00,000"],
  ["Photography", "8", "₹2,00,000"],
] as const;

/** The sample wedding opens on its Budget tab with the instruction already typed (spec 5.10). */
export const HERO_DEMO_HREF = "/demo/wedding?tab=budget&ai=Cut+decor+spend+by+20%25";

const fakeButton = "inline-flex min-h-11 items-center rounded-md border px-3.5 text-body-sm font-semibold";

/**
 * The hero's product preview (DR2-08): one link whose name is its visible last line. The table and
 * AI card inside are decorative, hidden from assistive tech, and their "buttons" are plain spans.
 */
export function HeroPreview() {
  return (
    <Link href={HERO_DEMO_HREF} className="hidden -rotate-[0.6deg] gap-3.5 rounded-xl bg-surface p-5 text-fg no-underline shadow-3 md:grid">
      <div aria-hidden="true" className="grid gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Budget · Ananya &amp; Rohan&apos;s wedding</span>
          <Tag tone="type">Wedding</Tag>
        </div>
        <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-[12px] border border-line text-[13px]">
          <thead>
            <tr className="bg-surface-sunken text-caption text-fg-muted">
              <th className="border-b border-line px-3 py-2 text-left font-semibold">Category</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">%</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([category, percent, amount]) => (
              <tr key={category}>
                <td className="border-b border-line px-3 py-2">{category}</td>
                <td className="border-b border-line px-3 py-2 text-right">{percent}</td>
                <td className="border-b border-line px-3 py-2 text-right">{amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-sunken font-bold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">100</td>
              <td className="px-3 py-2 text-right">₹25,00,000</td>
            </tr>
          </tfoot>
        </table>
        <div className="grid gap-2.5 rounded-lg border border-l-4 border-line border-l-accent bg-surface p-4 shadow-2">
          <div className="flex items-center justify-between">
            <OriginTag origin="ai" />
            <Tag tone="success" icon={<Check />}>
              Valid
            </Tag>
          </div>
          <b className="text-body-sm">Reduce Decor by 20%</b>
          <div className="num flex flex-wrap items-center gap-2.5 text-body-sm">
            <span className="text-fg-muted">Decor</span>
            <span className="text-fg-muted line-through">₹3,00,000</span>
            <span className="text-fg-muted">→</span>
            <b>₹2,40,000</b>
            <Tag tone="success">−₹60,000</Tag>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`${fakeButton} border-transparent bg-brand text-on-brand`}>Accept</span>
            <span className={`${fakeButton} border-line-strong bg-surface text-brand`}>Edit</span>
            <span className={`${fakeButton} border-transparent text-brand`}>Decline</span>
          </div>
        </div>
      </div>
      <span className="flex items-center gap-1 text-body-sm font-semibold text-brand">
        Try this in the sample wedding
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}
