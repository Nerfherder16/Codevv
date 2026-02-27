/**
 * useEventStream — WebSocket hook for /ws/events
 * Reconnects automatically on disconnect. Dispatches AppEvents to subscribers.
 */
import { useEffect, useRef, useCallback } from "react";
import type { AppEvent } from "../types";

type EventCallback = (event: AppEvent) => void;

interface UseEventStreamOptions {
  token: string | null;
  onEvent?: EventCallback;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useEventStream({
  token,
  onEvent,
  onConnect,
  onDisconnect,
}: UseEventStreamOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/events?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      onConnect?.();
    };

    ws.onmessage = (evt) => {
      try {
        const event: AppEvent = JSON.parse(evt.data);
        onEvent?.(event);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (evt) => {
      onDisconnect?.();
      // Don't reconnect on auth failure (4001)
      if (evt.code === 4001 || !mountedRef.current) return;
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, onEvent, onConnect, onDisconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
