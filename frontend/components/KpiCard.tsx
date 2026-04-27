interface KpiCardProps {
  title: string;
  value: string;
  trend: string;
  trendUp?: boolean;
}

export function KpiCard({ title, value, trend, trendUp }: KpiCardProps) {
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
