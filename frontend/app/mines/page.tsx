"use client";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents" },
    { label: "Compliance", href: "/compliance" },
    { label: "Costs", href: "/costs" },
    { label: "Mines", href: "/mines", active: true },
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

export default function MinesPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Mine Projects</h2>
        </header>
        <div className="flex-1 p-4 overflow-auto">
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">Mine project data will appear here once documents are processed.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
