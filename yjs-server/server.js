const http = require("http");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");
const { TLSocketRoom } = require("@tldraw/sync-core");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "1234", 10);
const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL pool for y-websocket persistence
let pool = null;
if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL });
  pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS yjs_docs (
      doc_name TEXT PRIMARY KEY,
      doc_data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `,
    )
    .then(() => console.log("yjs_docs table ready"))
    .catch((err) =>
      console.error("Failed to create yjs_docs table:", err.message),
    );
}

// tldraw sync rooms — ephemeral, keyed by canvasId
const tlRooms = new Map();

function getTldrawRoom(roomId) {
  if (!tlRooms.has(roomId)) {
    console.log(`[tldraw] Creating room: ${roomId}`);
    tlRooms.set(roomId, new TLSocketRoom());
  }
  return tlRooms.get(roomId);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", tlRooms: tlRooms.size }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Codevv Yjs + Tldraw Sync Server");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const url = req.url || "";

  if (url.startsWith("/connect/")) {
    // tldraw sync protocol
    const roomId = url.slice("/connect/".length).split("?")[0];
    const sessionId = randomUUID();
    const room = getTldrawRoom(roomId);

    console.log(`[tldraw] Session ${sessionId} joined room ${roomId}`);

    room.handleSocketConnect({ sessionId, socket: ws });

    ws.on("message", (data) => {
      const msg = typeof data === "string" ? data : data.toString();
      room.handleSocketMessage(sessionId, msg);
    });

    ws.on("close", () => {
      console.log(`[tldraw] Session ${sessionId} left room ${roomId}`);
      room.handleSocketClose(sessionId);
      // Clean up empty rooms after a delay
      setTimeout(() => {
        const r = tlRooms.get(roomId);
        if (r && r.getNumActiveSessions() === 0) {
          console.log(`[tldraw] Removing empty room: ${roomId}`);
          tlRooms.delete(roomId);
        }
      }, 10000);
    });

    ws.on("error", () => {
      room.handleSocketError(sessionId);
    });
  } else {
    // y-websocket for Yjs (existing)
    setupWSConnection(ws, req, { gc: true });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Yjs + Tldraw Sync server running on ${HOST}:${PORT}`);
});
