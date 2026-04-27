import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../lib/logger";

const PORT = parseInt(process.env.REALTIME_PORT || "3001", 10);

// Map<tenantId, Set<WebSocket>>
const tenantClients = new Map<string, Set<WebSocket>>();

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/publish") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        broadcast(data.tenantId, {
          eventType: data.eventType,
          source: data.source,
          payload: data.payload,
          eventId: data.eventId,
          timestamp: new Date().toISOString(),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    ws.close(1008, "Missing tenantId");
    return;
  }

  if (!tenantClients.has(tenantId)) {
    tenantClients.set(tenantId, new Set());
  }
  tenantClients.get(tenantId)!.add(ws);

  logger.info({ tenantId, clients: tenantClients.get(tenantId)!.size }, "WebSocket client connected");

  ws.send(JSON.stringify({ type: "CONNECTED", tenantId }));

  ws.on("close", () => {
    tenantClients.get(tenantId)?.delete(ws);
    if (tenantClients.get(tenantId)?.size === 0) {
      tenantClients.delete(tenantId);
    }
    logger.info({ tenantId }, "WebSocket client disconnected");
  });

  ws.on("error", (err) => {
    logger.error({ err, tenantId }, "WebSocket error");
  });
});

function broadcast(tenantId: string, message: any) {
  const clients = tenantClients.get(tenantId);
  if (!clients) return;

  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }

  logger.debug({ tenantId, clients: clients.size, eventType: message.eventType }, "Broadcasted event");
}

server.listen(PORT, () => {
  logger.info(`Realtime WebSocket server listening on port ${PORT}`);
});

export { broadcast };
