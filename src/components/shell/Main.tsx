import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** The page's main landmark and the skip link's target. */
export function Main({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main id="main" tabIndex={-1} className={cx("flex-1 outline-none", className)}>
      {children}
    </main>
  );
}

/** The content column: 1200 px max (900 px for forms), 16 px gutter on phones. */
export function PageColumn({ children, className, narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cx("mx-auto w-full px-4 py-7 sm:px-6", narrow ? "max-w-[900px]" : "max-w-[1200px]", className)}>{children}</div>;
}
