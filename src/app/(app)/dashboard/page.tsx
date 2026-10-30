import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Main } from "@/components/shell/Main";

export const metadata: Metadata = { title: "My events" };

export default function DashboardPage() {
  return (
    <Main>
      {/* The tabs read ?view= on the client. */}
      <Suspense>
        <Dashboard />
      </Suspense>
    </Main>
  );
}
