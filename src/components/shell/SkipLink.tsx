import { buttonClasses } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/** The first Tab stop on every page: off-screen until focused, then a primary button top-left (design-system 8.1). */
export function SkipLink() {
  return (
    <a href="#main" className={cx(buttonClasses(), "fixed top-4 left-4 z-[60] -translate-y-24 shadow-2 focus-visible:translate-y-0")}>
      Skip to main content
    </a>
  );
}
