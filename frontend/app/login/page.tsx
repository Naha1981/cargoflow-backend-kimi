"use client";

import { useState } from "react";
import { api } from "@lib/api";

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let res;
      if (isSignup) {
        res = await api.signup(email, password, tenantName);
      } else {
        res = await api.login(email, password);
      }
      localStorage.setItem("cf_token", res.token);
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-center text-primary mb-1">CargoFlow</h1>
        <p className="text-center text-muted-foreground text-sm mb-6">
          {isSignup ? "Create your organization" : "Sign in to your account"}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {isSignup && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Organization Name</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          {error && <p className="text-rose-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Please wait..." : isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-primary hover:underline"
          >
            {isSignup ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}
