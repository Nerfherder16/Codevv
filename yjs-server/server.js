const http = require("http");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");
const { Pool } = require("pg");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "1234", 10);
const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL pool for persistence
let pool = null;
if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL });
  // Ensure yjs_docs table exists
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

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Build Hub Yjs Server");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  setupWSConnection(ws, req, {
    gc: true,
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Yjs WebSocket server running on ${HOST}:${PORT}`);
});
