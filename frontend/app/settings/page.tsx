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
    { label: "Alerts", href: "/alerts" },
    { label: "Settings", href: "/settings", active: true },
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

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Settings</h2>
        </header>
        <div className="flex-1 p-4 overflow-auto">
          <div className="max-w-xl space-y-6">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Account</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{user?.email || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] uppercase">{user?.role || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tenant</span>
                  <span className="text-muted-foreground">{user?.tenantId || "—"}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("cf_token");
                window.location.href = "/login";
              }}
              className="w-full bg-destructive text-destructive-foreground rounded-md py-2 text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
