interface AlertStreamProps {
  events: any[];
}

const severityColor: Record<string, string> = {
  critical: "border-l-rose-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-500",
  info: "border-l-gray-500",
};

export function AlertStream({ events }: AlertStreamProps) {
  return (
    <div className="space-y-2">
      {events.slice(0, 8).map((ev, i) => (
        <div
          key={i}
          className={`bg-card border border-border border-l-4 ${severityColor[ev.payload?.severity || ev.payload?.riskLevel || "info"]} rounded-r-md p-3 text-xs`}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{ev.eventType}</span>
            <span className="text-muted-foreground">
              {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "--"}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground truncate">
            {JSON.stringify(ev.payload).slice(0, 120)}
          </p>
        </div>
      ))}
      {events.length === 0 && <p className="text-muted-foreground text-xs">No events yet.</p>}
    </div>
  );
}
