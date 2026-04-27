"use client";

import { useEffect, useState } from "react";
import { api } from "@lib/api";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents" },
    { label: "Compliance", href: "/compliance" },
    { label: "Costs", href: "/costs" },
    { label: "Mines", href: "/mines" },
    { label: "Oil", href: "/oil" },
    { label: "Alerts", href: "/alerts", active: true },
    { label: "Settings", href: "/settings" },
  ];
  return (
    <aside className="w-48 border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold tracking-tight text-primary">CargoFlow</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {nav.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              item.active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAlerts("limit=100")
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) });
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    } catch {
      // ignore
    }
  };

  const severityColor: Record<string, string> = {
    critical: "text-rose-400 border-l-rose-500",
    high: "text-orange-400 border-l-orange-500",
    medium: "text-yellow-400 border-l-yellow-500",
    low: "text-blue-400 border-l-blue-500",
    info: "text-gray-400 border-l-gray-500",
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Alerts</h2>
        </header>
        <div className="flex-1 p-4 overflow-auto">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-card border border-border border-l-4 rounded-r-md p-3 flex items-start justify-between ${severityColor[alert.severity] || severityColor.info}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${severityColor[alert.severity] || ""}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-sm">{alert.message}</p>
                  </div>
                  {!alert.read && (
                    <button
                      onClick={() => markRead(alert.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
              {alerts.length === 0 && <p className="text-muted-foreground text-center">No alerts.</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("cf_token") : "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}
