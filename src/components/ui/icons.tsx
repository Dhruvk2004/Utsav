import type { SVGProps } from "react";

/**
 * Utsav's own glyphs, drawn on Lucide's 24 px grid (design-system 5). They are decorative, so they
 * are hidden from assistive tech; the text next to them carries the meaning.
 */

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

const FLAME =
  "M51.7 29.4c-6.4-1.3-13.9-4.9-13.9-12.6 0-6 4.6-8.4 6.4-14.8 1.6 4.3 4.9 6.3 7.7 8.8 2.6 2.4 4.1 5.2 4.1 8.8 0 4.4-1.6 7.5-4.3 9.8z";
const BOWL = "M7.5 38.5H43l12.5-5.5-5.8 9.6C46.2 50 38 55 27.5 55 16.2 55 8.4 48.2 7.5 38.5z";

/** The AI marker: the logo's flame silhouette, filled. Used only for AI content and AI actions. */
export function FlameIcon({ size = 20, ...props }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" {...props}>
      <path transform="translate(-21.7 .8) scale(.72)" d={FLAME} fill="currentColor" />
    </svg>
  );
}

/** "Suggested by Utsav", starter template and idea-library marker: the diya outline. */
export function DiyaIcon({ size = 20, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <g transform="translate(0 1.5) scale(.375)">
        <path vectorEffect="non-scaling-stroke" d={BOWL} />
        <path vectorEffect="non-scaling-stroke" d={FLAME} />
      </g>
    </svg>
  );
}

/** Google's "G", in Google's colours, for the sign-in button only. */
export function GoogleIcon({ size = 20, ...props }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" {...props}>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
