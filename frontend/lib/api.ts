const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("cf_token") : "";
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (email: string, password: string, tenantName: string) =>
    apiFetch("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, tenantName }) }),
  me: () => apiFetch("/api/me"),
  getShipments: (params?: string) => apiFetch(`/api/shipments${params ? `?${params}` : ""}`),
  getShipment: (id: string) => apiFetch(`/api/shipments/${id}`),
  getAlerts: (params?: string) => apiFetch(`/api/alerts${params ? `?${params}` : ""}`),
  getDocuments: (params?: string) => apiFetch(`/api/documents${params ? `?${params}` : ""}`),
  getApprovals: () => apiFetch("/api/approvals"),
  resolveApproval: (id: string, status: "approved" | "rejected", notes?: string) =>
    apiFetch(`/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status, notes }) }),
  uploadDocument: (fileBase64: string, filename: string, mimeType: string) =>
    apiFetch("/api/documents/upload", { method: "POST", body: JSON.stringify({ fileBase64, filename, mimeType }) }),
};
