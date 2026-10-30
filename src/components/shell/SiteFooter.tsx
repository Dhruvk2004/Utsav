import Link from "next/link";

/**
 * Footer on every page: the trust statement and the "How Utsav uses AI" link in the same place
 * everywhere (WCAG 3.2.6 consistent help).
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid w-full max-w-[1200px] gap-3 px-4 py-6 text-body-sm text-fg-muted sm:px-6 lg:px-10">
        <p className="m-0">
          <b className="text-fg">AI suggests. Utsav checks the numbers. You decide.</b> Costs are estimates. We never list or recommend
          specific businesses.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
          <Link href="/privacy" className="inline-flex min-h-11 items-center text-brand underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/privacy#gemini" className="inline-flex min-h-11 items-center text-brand underline underline-offset-2">
            How Utsav uses AI
          </Link>
        </nav>
      </div>
    </footer>
  );
}
