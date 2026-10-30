import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

/** 404 (spec 10.17): plain words and one action, on the rangoli grid. */
export function NotFound() {
  return (
    <div className="rangoli grid min-h-[60vh] place-items-center px-4 py-12">
      <div className="grid max-w-[480px] justify-items-center gap-4 text-center">
        <Logo variant="mark" className="size-16" />
        <h1 className="m-0 font-display text-h1 font-semibold">We couldn&apos;t find that page.</h1>
        <p className="m-0 text-fg-muted">The link may be old, or the plan may have been deleted.</p>
        <ButtonLink href="/dashboard" fullLoad>
          Go to my events
        </ButtonLink>
      </div>
    </div>
  );
}
