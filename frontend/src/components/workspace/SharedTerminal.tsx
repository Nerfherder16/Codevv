import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { TerminalSession } from "../../types";
import { cn } from "../../lib/utils";

interface Props {
  session: TerminalSession;
  token: string;
  currentUserId: string;
}

export function SharedTerminal({ session, token, currentUserId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isOwner = session.owner_id === currentUserId;
  const canType = session.mode === "collaborative" || isOwner;

  const connect = useCallback(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: canType,
      fontSize: 14,
      fontFamily: "JetBrains Mono, Fira Code, monospace",
      theme: {
        background: "#0f0d1a",
        foreground: "#e5e7eb",
        cursor: "#38bdf8",
        selectionBackground: "rgba(56, 189, 248, 0.3)",
        black: "#1e1b2e",
        red: "#ef4444",
        green: "#34d399",
        yellow: "#f59e0b",
        blue: "#38bdf8",
        magenta: "#8b5cf6",
        cyan: "#22d3ee",
        white: "#e5e7eb",
      },
      disableStdin: !canType,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${session.id}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      term.clear();
      term.write(e.data);
    };

    ws.onclose = () => {
      term.write("\r\n\x1b[90m[Connection closed]\x1b[0m\r\n");
    };

    if (canType) {
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [session.id, token, canType]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1b2e] border-b border-white/5">
        <span className="text-xs text-gray-400 font-mono">
          {session.tmux_session}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full",
            session.mode === "collaborative"
              ? "bg-teal-500/20 text-teal-300"
              : "bg-gray-500/20 text-gray-400",
          )}
        >
          {session.mode === "collaborative" ? "Collaborative" : "Read-only"}
        </span>
        {!canType && (
          <span className="text-[10px] text-amber-400/80 ml-auto">
            Spectating
          </span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 bg-[#0f0d1a] p-1" />
    </div>
  );
}
