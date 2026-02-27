/**
 * EventStreamContext — app-wide real-time event stream.
 * Tracks per-project unread activity badge counts.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { useEventStream } from "../hooks/useEventStream";
import { useAuth } from "./AuthContext";
import type { AppEvent } from "../types";

interface EventStreamContextValue {
  connected: boolean;
  badgeCounts: Record<string, number>;
  clearBadge: (projectId: string) => void;
  lastEvent: AppEvent | null;
}

const EventStreamContext = createContext<EventStreamContextValue>({
  connected: false,
  badgeCounts: {},
  clearBadge: () => {},
  lastEvent: null,
});

export function EventStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const token = user ? localStorage.getItem("bh-token") : null;
  const [connected, setConnected] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [lastEvent, setLastEvent] = useState<AppEvent | null>(null);

  // Track which project is currently "focused" to suppress badge increments
  const focusedProjectRef = useRef<string | null>(null);

  const handleEvent = useCallback((event: AppEvent) => {
    setLastEvent(event);
    // Extract project_id from payload if present
    const projectId = event.payload?.project_id as string | undefined;
    if (projectId && projectId !== focusedProjectRef.current) {
      setBadgeCounts((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? 0) + 1,
      }));
    }
  }, []);

  const clearBadge = useCallback((projectId: string) => {
    focusedProjectRef.current = projectId;
    setBadgeCounts((prev) => {
      if (!prev[projectId]) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  useEventStream({
    token,
    onEvent: handleEvent,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  });

  return (
    <EventStreamContext.Provider
      value={{ connected, badgeCounts, clearBadge, lastEvent }}
    >
      {children}
    </EventStreamContext.Provider>
  );
}

export function useEventStreamContext() {
  return useContext(EventStreamContext);
}
