"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The one shared polite live region (spec 9.2) for saves and code-built change summaries such as
 * "Saved. Venue and 4 other categories adjusted." Repeating a message announces it again.
 */
const AnnouncerContext = createContext<((message: string) => void) | null>(null);

export function useAnnounce(): (message: string) => void {
  const announce = useContext(AnnouncerContext);
  if (!announce) throw new Error("useAnnounce must be used inside <AnnouncerProvider>");
  return announce;
}

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const announce = useCallback((next: string) => {
    // Clear first so the same text is read again; screen readers ignore unchanged content.
    setMessage("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(next), 50);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="announcer">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}
