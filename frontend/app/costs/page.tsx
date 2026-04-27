"use client";

import { useEffect, useState } from "react";
import { api } from "@lib/api";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents" },
    { label: "Compliance", href: "/compliance" },
    { label: "Costs", href: "/costs", active: true },
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

export default function CostsPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getShipments("limit=50")
      .then(async (d) => {
        const enriched = [];
        for (const s of d.shipments || []) {
          try {
            const detail = await apiFetch(`/api/shipments/${s.id}`);
            enriched.push({ ...s, costs: detail.costs });
          } catch {
            enriched.push({ ...s, costs: null });
          }
        }
        setShipments(enriched);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Costs & Margins</h2>
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
                    <th className="text-left px-4 py-2">Freight</th>
                    <th className="text-left px-4 py-2">Duty</th>
                    <th className="text-left px-4 py-2">VAT</th>
                    <th className="text-left px-4 py-2">Insurance</th>
                    <th className="text-left px-4 py-2">Transport</th>
                    <th className="text-left px-4 py-2">Total</th>
                    <th className="text-left px-4 py-2">Margin</th>
                    <th className="text-left px-4 py-2">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shipments.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.shipment_code || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.costs?.freight || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.costs?.duty || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.costs?.vat || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.costs?.insurance || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.costs?.transport || "—"}</td>
                      <td className="px-4 py-3 font-semibold">{s.costs?.total_cost || "—"}</td>
                      <td className="px-4 py-3">{s.costs?.margin ? `${s.costs.margin}%` : "—"}</td>
                      <td className="px-4 py-3">
                        {s.costs?.low_margin_flag ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">Low</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shipments.length === 0 && <p className="p-4 text-muted-foreground text-center">No cost data.</p>}
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
