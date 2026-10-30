import { useId } from "react";
import { cx } from "@/components/ui/cx";

/**
 * The Utsav logo (design-system 1.2): "the diya that says done". The mark keeps fixed colours in
 * both themes through the logo tokens, with a ring that only shows on dark surfaces. The wordmark
 * strokes follow the brand colour, or `currentColor` on the brand band. `mono` is one colour with
 * the bowl, flame and check cut out. Never hard-coded hex here: colours come from tokens.
 */
type LogoVariant = "full" | "mark" | "mono";

const BOWL = "M7.5 38.5H43l12.5-5.5-5.8 9.6C46.2 50 38 55 27.5 55 16.2 55 8.4 48.2 7.5 38.5zM50.4 35.6v-4.4a1.3 1.3 0 0 1 2.6 0v3.3z";
const FLAME =
  "M51.7 29.4c-6.4-1.3-13.9-4.9-13.9-12.6 0-6 4.6-8.4 6.4-14.8 1.6 4.3 4.9 6.3 7.7 8.8 2.6 2.4 4.1 5.2 4.1 8.8 0 4.4-1.6 7.5-4.3 9.8z";
const CHECK = "M41.6 17.6l3.7 3.7 6.6-7.4";
const TILE = { width: 64, height: 64, rx: 15 };
const WORD_FLAME =
  "M122.2 17.6c-3.4-.6-6.6-2.6-6.6-6.2 0-3 2.3-4.2 3.2-7.4.8 2.1 2.5 3.1 3.9 4.4 1.3 1.2 2.1 2.6 2.1 4.4 0 2.2-.8 3.7-2.6 4.8z";

function Mark() {
  return (
    <>
      <rect {...TILE} className="fill-logo-tile" />
      <rect x={0.75} y={0.75} width={62.5} height={62.5} rx={14.25} fill="none" strokeWidth={1.5} className="stroke-logo-ring" />
      <path d={BOWL} className="fill-logo-bowl" />
      <path d={FLAME} className="fill-logo-flame" />
      <path d={CHECK} fill="none" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" className="stroke-logo-tile" />
    </>
  );
}

function Wordmark({ flameClass }: { flameClass: string }) {
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M83 14v24a12 12 0 0 0 24 0V14" />
        <path d="M121 22v22a6 6 0 0 0 6 6h2M114.5 27h14" />
        <path d="M157 30.5c-1.8-3-5.3-4.5-9-4.5-5.3 0-9 2.7-9 6.3 0 8.2 18 4.5 18 12 0 3.6-3.8 5.7-9.2 5.7-4.4 0-7.8-1.6-9.6-4.4" />
        <circle cx={178} cy={38} r={12} />
        <path d="M190 26v24" />
        <path d="M201 26l11 24 11-24" />
      </g>
      <path d={WORD_FLAME} className={flameClass} />
    </>
  );
}

export function Logo({ variant = "full", onHero = false, className }: { variant?: LogoVariant; onHero?: boolean; className?: string }) {
  const maskId = useId();
  if (variant === "mark") {
    return (
      <svg viewBox="0 0 64 64" role="img" aria-label="Utsav" className={className}>
        <Mark />
      </svg>
    );
  }
  if (variant === "mono") {
    return (
      <svg viewBox="0 0 232 64" role="img" aria-label="Utsav" className={cx("text-current", className)}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={64} height={64}>
            <rect {...TILE} fill="#fff" />
            <path d={BOWL} fill="#000" />
            <path d={FLAME} fill="#000" />
            <path d={CHECK} fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
          </mask>
        </defs>
        <rect {...TILE} fill="currentColor" mask={`url(#${maskId})`} />
        <Wordmark flameClass="fill-current" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 232 64" role="img" aria-label="Utsav" className={cx(onHero ? "text-hero-fg" : "text-brand", className)}>
      <Mark />
      <Wordmark flameClass="fill-logo-flame" />
    </svg>
  );
}
