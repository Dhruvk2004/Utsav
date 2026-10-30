import { CircleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";

/** Error boundary content (spec 10.17): reassures that nothing was lost and shows only a reference, never details. */
export function ErrorPanel({ reference, onRetry }: { reference?: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-12">
      <div role="alert" className="grid w-full max-w-[420px] gap-3 rounded-lg border border-line bg-surface p-5 shadow-1">
        <div className="flex items-center gap-2">
          <CircleAlert size={24} className="text-danger" aria-hidden="true" />
          <h1 className="m-0 text-h2 font-bold">Something went wrong.</h1>
        </div>
        <p className="m-0">Your plan is saved; nothing was lost.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to my events
          </ButtonLink>
        </div>
        {reference && <span className="text-caption text-fg-muted">Error ref: {reference}</span>}
      </div>
    </div>
  );
}

/** A short reference from the server's error digest, so support can match logs without showing details. */
export function errorReference(error: unknown): string | undefined {
  if (error instanceof Error && "digest" in error && typeof error.digest === "string") return error.digest.slice(0, 8);
  return undefined;
}
