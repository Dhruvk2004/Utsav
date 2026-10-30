"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { useServices } from "@/components/data/ServicesProvider";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { GoogleIcon } from "@/components/ui/icons";
import { afterSignInPath } from "@/lib/client/navigation";
import type { SignInFailure, SignInResult } from "@/lib/data/authClient";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "failed"; reason: SignInFailure };

/**
 * Sign-in card (spec 10.2): one Google button, a polite "Signing in…" status and the three error
 * states. Without Firebase configuration it says so plainly instead of offering a broken button.
 */
export function SignInCard({ configured }: { configured: boolean }) {
  const { auth } = useServices();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const finish = useCallback(
    (result: SignInResult) => {
      if (result.ok) router.push(afterSignInPath(result.onboarded, next));
      else setStatus({ kind: "failed", reason: result.reason });
    },
    [router, next],
  );

  async function signIn() {
    setStatus({ kind: "loading" });
    finish(await auth.signIn());
  }

  // Warm up sign-in so the popup opens straight from the click, and finish a redirect sign-in.
  useEffect(() => {
    if (!configured) return;
    auth.preload();
    let active = true;
    void auth.completeRedirect().then((result) => {
      if (active && result) finish(result);
    });
    return () => {
      active = false;
    };
  }, [auth, configured, finish]);

  return (
    <div className="grid w-full max-w-[440px] gap-4 rounded-xl border border-line bg-surface p-6 shadow-2 sm:p-8">
      <Logo variant="mark" className="size-12" />
      <h1 className="m-0 font-display text-h1 font-semibold">Sign in to save your plans</h1>
      <p className="m-0 text-body-sm text-fg-muted">
        Your profile and events are stored in your account. Nothing is shared unless you create a share link.
      </p>
      {configured ? (
        <Button variant="google" size="lg" block icon={<GoogleIcon />} loading={status.kind === "loading"} onClick={signIn}>
          Continue with Google
        </Button>
      ) : (
        <Alert
          tone="warning"
          title="Sign-in isn't configured on this deployment."
          action={
            <ButtonLink href="/demo" variant="secondary">
              See a sample plan
            </ButtonLink>
          }
        >
          You can still explore the sample plans without an account.
        </Alert>
      )}
      <p className="m-0 min-h-0 text-body-sm font-semibold empty:hidden" role="status">
        {status.kind === "loading" ? "Signing in…" : ""}
      </p>
      {status.kind === "failed" && (
        <FailureAlert reason={status.reason} onRetry={signIn} onRedirect={() => void auth.signInWithRedirect()} />
      )}
      <p className="m-0 text-caption text-fg-muted">
        Read our{" "}
        <Link href="/privacy" className="text-brand underline underline-offset-2">
          Privacy notice
        </Link>
        . Utsav uses Google Gemini to draft suggestions.
      </p>
    </div>
  );
}

function FailureAlert({ reason, onRetry, onRedirect }: { reason: SignInFailure; onRetry: () => void; onRedirect: () => void }) {
  if (reason === "popup_blocked") {
    return (
      <Alert
        tone="warning"
        title="Your browser blocked the sign-in window."
        action={
          <Button variant="secondary" size="sm" onClick={onRedirect}>
            Continue in this tab
          </Button>
        }
      >
        We can open Google sign-in in this tab instead.
      </Alert>
    );
  }
  const retry = (
    <Button variant="secondary" size="sm" onClick={onRetry}>
      Try again
    </Button>
  );
  return reason === "cancelled" ? (
    <Alert tone="danger" title="Sign-in was cancelled." action={retry}>
      Try again when you&apos;re ready.
    </Alert>
  ) : (
    <Alert tone="offline" title="Couldn't reach Google." action={retry}>
      Check your connection and try again.
    </Alert>
  );
}
