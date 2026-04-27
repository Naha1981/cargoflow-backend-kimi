"use client";

import { useEffect, useState } from "react";
import { api } from "@lib/api";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments", active: true },
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

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.getShipments("limit=50")
      .then((d) => setShipments(d.shipments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = shipments.filter((s) =>
    (s.shipment_code || "").toLowerCase().includes(filter.toLowerCase()) ||
    (s.supplier || "").toLowerCase().includes(filter.toLowerCase()) ||
    (s.origin || "").toLowerCase().includes(filter.toLowerCase()) ||
    (s.destination || "").toLowerCase().includes(filter.toLowerCase())
  );

  const riskBadge = (level: string) => {
    const map: Record<string, string> = {
      low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      critical: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    };
    return map[level] || map.low;
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Shipments</h2>
          <input
            type="text"
            placeholder="Search shipments..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-muted border border-border rounded-md px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </header>
        <div className="flex-1 p-4 overflow-auto">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Code</th>
                    <th className="text-left px-4 py-2">Supplier</th>
                    <th className="text-left px-4 py-2">Origin → Destination</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Risk</th>
                    <th className="text-left px-4 py-2">Value</th>
                    <th className="text-left px-4 py-2">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.shipment_code || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.supplier || "—"}</td>
                      <td className="px-4 py-3">{s.origin || "—"} → {s.destination || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px]">
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${riskBadge(s.risk_level)}`}>
                          {s.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.value ? `${s.value} ${s.currency}` : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.eta ? new Date(s.eta).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="p-4 text-muted-foreground text-center">No shipments found.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
