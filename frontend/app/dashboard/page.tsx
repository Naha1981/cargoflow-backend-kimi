"use client";

import { useRealtimeStream } from "@hooks/useRealtimeStream";
import { api } from "@lib/api";
import { useEffect, useState } from "react";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard", active: true },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents" },
    { label: "Compliance", href: "/compliance" },
    { label: "Costs", href: "/costs" },
    { label: "Mines", href: "/mines" },
    { label: "Oil", href: "/oil" },
    { label: "Alerts", href: "/alerts" },
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

function KpiCard({ title, value, trend, trendUp }: { title: string; value: string; trend: string; trendUp?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className={`mt-1 text-xs font-medium ${trendUp ? "text-emerald-400" : "text-rose-400"}`}>
        {trendUp ? "▲" : "▼"} {trend}
      </p>
    </div>
  );
}

function AlertFeed({ events }: { events: any[] }) {
  const severityColor: Record<string, string> = {
    critical: "border-l-rose-500",
    high: "border-l-orange-500",
    medium: "border-l-yellow-500",
    low: "border-l-blue-500",
    info: "border-l-gray-500",
  };
  return (
    <div className="space-y-2">
      {events.slice(0, 8).map((ev, i) => (
        <div key={i} className={`bg-card border border-border border-l-4 ${severityColor[ev.payload?.severity || ev.payload?.riskLevel || "info"]} rounded-r-md p-3 text-xs`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">{ev.eventType}</span>
            <span className="text-muted-foreground">{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "--"}</span>
          </div>
          <p className="mt-1 text-muted-foreground truncate">{JSON.stringify(ev.payload).slice(0, 120)}</p>
        </div>
      ))}
      {events.length === 0 && <p className="text-muted-foreground text-xs">No events yet.</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [tenantId, setTenantId] = useState<string>("demo-tenant");
  const [kpis, setKpis] = useState({ shipments: 0, alerts: 0, pending: 0, completed: 0 });
  const { events, connected } = useRealtimeStream(tenantId);

  useEffect(() => {
    const token = localStorage.getItem("cf_token");
    if (!token) return;
    api.me().then((data) => {
      if (data?.user?.tenantId) setTenantId(data.user.tenantId);
    }).catch(() => {});

    api.getShipments("limit=1").then((d) => setKpis((k) => ({ ...k, shipments: d.shipments?.length || 0 }))).catch(() => {});
    api.getAlerts("read=false&limit=1").then((d) => setKpis((k) => ({ ...k, alerts: d.alerts?.length || 0 }))).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-xs text-muted-foreground">{connected ? "Live" : "Reconnecting..."}</span>
          </div>
          <div className="text-xs text-muted-foreground">{tenantId}</div>
        </header>
        <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-auto">
          <div className="col-span-12 grid grid-cols-4 gap-4">
            <KpiCard title="Shipments" value={String(kpis.shipments)} trend="12% vs last week" trendUp />
            <KpiCard title="Unread Alerts" value={String(kpis.alerts)} trend="3 new today" trendUp={false} />
            <KpiCard title="Pending Approvals" value={String(kpis.pending)} trend="Stable" trendUp />
            <KpiCard title="Completed Today" value={String(kpis.completed)} trend="8% vs yesterday" trendUp />
          </div>
          <div className="col-span-8 bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">Live Event Stream</h2>
            <div className="font-mono text-xs space-y-1 max-h-96 overflow-auto">
              {events.slice(0, 50).map((ev, i) => (
                <div key={i} className="flex gap-3 text-muted-foreground">
                  <span className="text-emerald-400 w-32 shrink-0">{ev.eventType}</span>
                  <span className="truncate">{JSON.stringify(ev.payload)}</span>
                </div>
              ))}
              {events.length === 0 && <p className="text-muted-foreground">Waiting for events...</p>}
            </div>
          </div>
          <div className="col-span-4 bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">AI Insights</h2>
            <AlertFeed events={events} />
          </div>
        </div>
      </main>
    </div>
  );
}
