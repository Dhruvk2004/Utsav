"use client";

import { Main } from "@/components/shell/Main";
import { ErrorPanel, errorReference } from "@/components/system/ErrorPanel";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Main>
      <ErrorPanel reference={errorReference(error)} onRetry={retry} />
    </Main>
  );
}
