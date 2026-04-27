"use client";

import { useEffect, useState } from "react";
import { api } from "@lib/api";
import { DocumentUploader } from "@components/DocumentUploader";

function Sidebar() {
  const nav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Shipments", href: "/shipments" },
    { label: "Documents", href: "/documents", active: true },
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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDocuments("limit=50")
      .then((d) => setDocuments(d.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      processed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      failed: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      rejected: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    };
    return map[status] || map.pending;
  };

  const handleUpload = (result: { runId: string; filePath: string; filename: string }) => {
    setDocuments((prev) => [
      {
        id: result.runId,
        doc_type: "Uploaded",
        file_path: result.filePath,
        status: "pending",
        confidence: null,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <h2 className="text-sm font-semibold">Documents</h2>
        </header>
        <div className="flex-1 p-4 overflow-auto space-y-4">
          <DocumentUploader onUpload={handleUpload} />
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Confidence</th>
                    <th className="text-left px-4 py-2">Path</th>
                    <th className="text-left px-4 py-2">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{doc.doc_type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(doc.status)}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {doc.confidence ? `${(doc.confidence * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{doc.file_path}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {documents.length === 0 && (
                <p className="p-4 text-muted-foreground text-center">No documents.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
