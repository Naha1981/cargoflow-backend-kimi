"use client";

import { useEffect, useState } from "react";
import { api } from "@lib/api";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents" },
    { label: "Compliance", href: "/compliance", active: true },
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

export default function CompliancePage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getApprovals()
      .then((d) => setApprovals(d.approvals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resolve = async (id: string, status: "approved" | "rejected") => {
    try {
      await api.resolveApproval(id, status);
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Compliance & Approvals</h2>
        </header>
        <div className="flex-1 p-4 overflow-auto">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Approvals</h3>
              {approvals.filter((a) => a.status === "pending").map((approval) => (
                <div key={approval.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Workflow Run {approval.workflow_run_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">File: {approval.file_path || "—"}</p>
                    <p className="text-xs text-muted-foreground">Created: {new Date(approval.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolve(approval.id, "approved")}
                      className="px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium hover:bg-emerald-500/20"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => resolve(approval.id, "rejected")}
                      className="px-3 py-1.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium hover:bg-rose-500/20"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {approvals.filter((a) => a.status === "pending").length === 0 && (
                <p className="text-muted-foreground text-sm">No pending approvals.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
