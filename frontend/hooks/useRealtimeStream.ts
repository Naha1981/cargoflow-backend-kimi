"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface StreamEvent {
  eventType: string;
  source: string;
  payload: Record<string, any>;
  eventId?: string;
  timestamp?: string;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";

export function useRealtimeStream(tenantId: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const tenantIdRef = useRef(tenantId);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?tenantId=${tenantIdRef.current}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "CONNECTED") return;
        setEvents((prev) => [data, ...prev].slice(0, 500));
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(reconnectDelayRef.current, 30000);
      reconnectDelayRef.current = delay * 2;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    tenantIdRef.current = tenantId;
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [tenantId, connect]);

  return { events, connected };
}
