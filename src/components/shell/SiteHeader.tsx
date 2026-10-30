import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/**
 * Signed-out header (spec 3.2): logo, "How it works", "See a sample plan" and Sign in. On the
 * landing page it sits on the brand band (`onHero`); sign-in and onboarding use the logo only.
 */
export function SiteHeader({ onHero = false, minimal = false }: { onHero?: boolean; minimal?: boolean }) {
  const linkClass = cx(
    "hidden min-h-11 items-center rounded-sm px-2 text-body-sm font-semibold no-underline sm:inline-flex",
    onHero ? "text-hero-fg opacity-90 hover:opacity-100" : "text-fg-muted hover:text-fg",
  );
  return (
    <header
      className={cx(
        "mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:h-[68px] sm:gap-6 sm:px-6 lg:px-10",
        !onHero && !minimal && "border-b border-line",
      )}
    >
      <Link href="/" className="inline-flex min-h-11 items-center rounded-sm">
        <Logo onHero={onHero} className="h-7 w-auto sm:h-[30px]" />
      </Link>
      {!minimal && (
        <>
          <span className="flex-1" />
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-4">
            <Link href="/#how-it-works" className={linkClass}>
              How it works
            </Link>
            <Link href="/demo" className={linkClass}>
              See a sample plan
            </Link>
          </nav>
          <ButtonLink href="/signin" fullLoad variant={onHero ? "hero" : "primary"} size={onHero ? "md" : "sm"}>
            Sign in
          </ButtonLink>
        </>
      )}
    </header>
  );
}
