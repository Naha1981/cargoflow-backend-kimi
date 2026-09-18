import type { EvidenceConfidence } from "./types";

export interface InvestigationSignal {
  fact: string;
  value: Record<string, unknown>;
  factType: "derived" | "interpretation";
  confidence: EvidenceConfidence;
  sourceEvidenceIds: string[];
}

export function deriveInvestigationSignals(
  evidenceRows: Array<Record<string, any>>,
  timelineRows: Array<Record<string, any>>
): InvestigationSignal[] {
  const signals: InvestigationSignal[] = [];

  const bySource = new Map<string, Array<Record<string, any>>>();
  for (const row of evidenceRows) {
    const list = bySource.get(String(row.source_type)) ?? [];
    list.push(row);
    bySource.set(String(row.source_type), list);
  }

  const evidenceIds = (type: string) =>
    (bySource.get(type) ?? []).map((row) => String(row.id));

  const gfwRows = bySource.get("ais") ?? [];
  const sentinelRows = [
    ...(bySource.get("sentinel-1") ?? []),
    ...(bySource.get("sentinel-2") ?? [])
  ];

  const gfwUnavailable = gfwRows.some(
    (row) => row.payload_json?.status === "requires_credentials"
  );
  if (gfwUnavailable) {
    signals.push({
      fact: "AIS provider coverage is not activated",
      value: {
        source: "Global Fishing Watch",
        reason: "GFW_API_TOKEN is not configured on the evidence worker"
      },
      factType: "interpretation",
      confidence: "inferred",
      sourceEvidenceIds: evidenceIds("ais")
    });
  }

  if (sentinelRows.length > 0 && gfwUnavailable) {
    signals.push({
      fact: "Cross-source coverage gap: satellite catalogue is available while AIS data is unavailable",
      value: {
        satelliteEvidenceCount: sentinelRows.length,
        aisProviderAvailable: false
      },
      factType: "derived",
      confidence: "derived",
      sourceEvidenceIds: [
        ...sentinelRows.map((row) => String(row.id)),
        ...evidenceIds("ais")
      ]
    });
  }

  const weatherEvents = timelineRows.filter(
    (row) => String(row.event_type) === "weather-exception"
  );
  if (weatherEvents.length > 0) {
    signals.push({
      fact: "Weather exceptions overlap the investigation window",
      value: {
        eventCount: weatherEvents.length,
        eventTimes: weatherEvents.slice(0, 50).map((event) => event.event_at)
      },
      factType: "derived",
      confidence: "reported",
      sourceEvidenceIds: weatherEvents.flatMap((event) => {
        const ids = event.evidence_ids;
        return Array.isArray(ids) ? ids.map(String) : [];
      })
    });
  }

  const marineRows = bySource.get("tides") ?? [];
  if (marineRows.length > 0) {
    signals.push({
      fact: "Marine conditions were captured for the investigation window",
      value: {
        provider: "Open-Meteo Marine",
        sourceCount: marineRows.length,
        tideLevelIsModelled: true
      },
      factType: "derived",
      confidence: "reported",
      sourceEvidenceIds: evidenceIds("tides")
    });
  }

  return signals;
}
