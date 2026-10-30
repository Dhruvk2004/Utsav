"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createHttpServices, type Services } from "@/lib/data/services";

/**
 * Supplies the data interfaces (auth, profile, events, workspaces) to client components. Pages
 * never import an implementation directly; tests pass in-memory `services`.
 */
const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services?: Services; children: ReactNode }) {
  // Created once per page load. Session storage only remembers a redirect sign-in in progress.
  const [value] = useState(() => services ?? createHttpServices(sessionStore()));
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

/** `sessionStorage`, or a no-op store where it is unavailable (prerendering, private modes that block it). */
function sessionStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    return window.sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <ServicesProvider>");
  return services;
}
