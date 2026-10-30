import { cx } from "./cx";

/**
 * Brand motifs (design-system 1.3), decorative and hidden from assistive tech. The toran edge is
 * used only on the landing hero, the onboarding "Done" card and the share page header, never next
 * to AI cards. The rangoli grid is the `rangoli` class on a container.
 */
export function Toran({ className }: { className?: string }) {
  return <div className={cx("toran", className)} aria-hidden="true" />;
}
