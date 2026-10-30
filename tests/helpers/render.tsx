import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { ServicesProvider } from "@/components/data/ServicesProvider";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ToastProvider } from "@/components/ui/Toast";

import { type EventSummary } from "@/lib/data/eventsRepository";

import type { Services } from "@/lib/data/services";

import type { UserProfile } from "@/lib/domain/model/user";
import { InMemoryEventsRepository, InMemoryProfileStore, STUB_PROFILE, StubAuthClient, StubWorkspaceRepository } from "./stubServices";

/** In-memory services with no latency; override any part per test. */
export function testServices(overrides: Partial<Services> & { profile?: Partial<UserProfile>; summaries?: EventSummary[] } = {}): Services {
  const { profile, summaries, ...rest } = overrides;
  const profiles = rest.profiles ?? new InMemoryProfileStore({ ...STUB_PROFILE, ...profile }, () => "2026-10-28T06:00:00.000Z");
  const events = rest.events ?? new InMemoryEventsRepository(() => summaries ?? []);
  return {
    profiles,
    auth: rest.auth ?? new StubAuthClient(profiles),
    events,
    workspaces: rest.workspaces ?? new StubWorkspaceRepository(events, () => "2026-10-28"),
  };
}

/** Renders inside the same providers as the root and signed-in layouts. */
export function renderApp(ui: ReactElement, { services = testServices(), ...options }: { services?: Services } & RenderOptions = {}) {
  return {
    services,
    ...render(
      <ServicesProvider services={services}>
        <AnnouncerProvider>
          <ToastProvider>{ui}</ToastProvider>
        </AnnouncerProvider>
      </ServicesProvider>,
      options,
    ),
  };
}
