import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Pencil, Monitor } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import type { Session } from "../../types";

interface Props {
  session: Session;
  onClose: () => void;
}

export function SessionShareModal({ session, onClose }: Props) {
  const { toast } = useToast();
  const baseUrl = window.location.origin;
  const drawUrl = `${baseUrl}/join/${session.join_code}?mode=draw`;
  const presentUrl = `${baseUrl}/join/${session.join_code}?mode=present`;

  const copy = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    toast(`${label} URL copied!`, "success");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/[0.08] bg-gray-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">Share Canvas Session</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{session.join_code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Draw mode — iPad/tablet */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <Pencil className="w-4 h-4 text-teal-400" />
              Drawing Device
            </div>
            <p className="text-xs text-gray-500 text-center">Scan with iPad or tablet</p>
            <div className="p-3 bg-white rounded-xl">
              <QRCodeSVG value={drawUrl} size={140} />
            </div>
            <button
              onClick={() => copy(drawUrl, "Draw")}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy link
            </button>
          </div>

          {/* Present mode — projector */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <Monitor className="w-4 h-4 text-violet-400" />
              Projector / Display
            </div>
            <p className="text-xs text-gray-500 text-center">No login needed</p>
            <div className="p-3 bg-white rounded-xl">
              <QRCodeSVG value={presentUrl} size={140} />
            </div>
            <button
              onClick={() => copy(presentUrl, "Present")}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy link
            </button>
          </div>
        </div>

        <div className="px-6 pb-4 text-center">
          <p className="text-xs text-gray-600">
            Join code: <span className="font-mono text-gray-400">{session.join_code}</span>
            {" · "}
            All devices connect to the same live canvas
          </p>
        </div>
      </div>
    </div>
  );
}
