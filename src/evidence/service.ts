import { query } from "../lib/db";
import { sha256 } from "./hash";
import {
  aircraft,
  earthquakes,
  geocodePlace,
  globalFishingWatchEvents,
  historicalWeather,
  osmFeatures,
  sentinelCatalog
} from "./providers";
import type { EvidenceItemInput, InvestigationInput } from "./types";

export async function createInvestigation(
  tenantId: string,
  input: InvestigationInput
): Promise<Record<string, unknown>> {
  let latitude = input.latitude;
  let longitude = input.longitude;
  let displayName: string | undefined;

  if ((latitude === undefined || longitude === undefined) && input.query) {
    const place = await geocodePlace(input.query);
    if (place) {
      latitude = place.latitude;
      longitude = place.longitude;
      displayName = place.displayName;
    }
  }

  const [row] = await query<Record<string, unknown>>(
    "INSERT INTO investigations " +
      "(tenant_id, title, query_text, latitude, longitude, start_date, end_date, status) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,'open') RETURNING *",
    [
      tenantId,
      input.title,
      input.query,
      latitude ?? null,
      longitude ?? null,
      input.startDate ?? null,
      input.endDate ?? null
    ]
  );

  return { ...row, display_name: displayName };
}

export async function addEvidence(
  tenantId: string,
  investigationId: string,
  input: EvidenceItemInput
): Promise<Record<string, unknown>> {
  const payloadHash = sha256(input.payload);
  const [row] = await query<Record<string, unknown>>(
    "INSERT INTO evidence_items " +
      "(tenant_id, investigation_id, source_type, source_url, title, observed_at, captured_at, confidence, payload_json, payload_sha256, metadata_json) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
    [
      tenantId,
      investigationId,
      input.sourceType,
      input.sourceUrl ?? null,
      input.title,
      input.observedAt ?? null,
      input.capturedAt ?? new Date().toISOString(),
      input.confidence,
      JSON.stringify(input.payload),
      payloadHash,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return row;
}

function iso(value: string | number | Date | undefined): string | null {
  if (value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function deriveTimeline(evidenceRows: Array<Record<string, any>>): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];

  for (const row of evidenceRows) {
    const payload = row.payload_json ?? {};

    if (row.source_type === "weather" && Array.isArray(payload.hourly?.time)) {
      const times: string[] = payload.hourly.time;
      const precip: number[] = payload.hourly.precipitation ?? [];
      const wind: number[] = payload.hourly.wind_gusts_10m ?? [];
      for (let i = 0; i < Math.min(times.length, 24 * 14); i += 1) {
        if ((precip[i] ?? 0) > 10 || (wind[i] ?? 0) > 50) {
          events.push({
            eventAt: times[i],
            eventType: "weather-exception",
            title: "Severe weather indicator",
            description: "Rain=" + (precip[i] ?? 0) + " mm; gust=" + (wind[i] ?? 0) + " km/h",
            evidenceIds: [String(row.id)],
            confidence: row.confidence,
            sourceType: row.source_type
          });
        }
      }
    }

    if (row.source_type === "earthquake" && Array.isArray(payload.features)) {
      for (const feature of payload.features.slice(0, 200)) {
        const at = iso(feature?.properties?.time);
        if (at) {
          events.push({
            eventAt: at,
            eventType: "earthquake",
            title: feature?.properties?.title ?? "Earthquake",
            description: feature?.properties?.place,
            evidenceIds: [String(row.id)],
            confidence: row.confidence,
            sourceType: row.source_type
          });
        }
      }
    }

    if (row.source_type === "ais" && Array.isArray(payload?.events)) {
      for (const event of payload.events.slice(0, 200)) {
        const at = event?.start ?? event?.end;
        if (at) {
          events.push({
            eventAt: at,
            eventType: String(event?.type ?? "ais-event").toLowerCase(),
            title: String(event?.type ?? "AIS event"),
            description: event?.port?.name ?? event?.vessel?.name,
            evidenceIds: [String(row.id)],
            confidence: row.confidence,
            sourceType: row.source_type
          });
        }
      }
    }
  }

  return events.sort((a, b) =>
    String(a.eventAt).localeCompare(String(b.eventAt))
  );
}

export async function collectPublicEvidence(
  tenantId: string,
  investigationId: string
): Promise<Record<string, unknown>> {
  const [investigation] = await query<Record<string, any>>(
    "SELECT * FROM investigations WHERE id=$1 AND tenant_id=$2",
    [investigationId, tenantId]
  );
  if (!investigation) throw new Error("Investigation not found");

  const startDate = investigation.start_date
    ? new Date(investigation.start_date).toISOString().slice(0, 10)
    : new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const endDate = investigation.end_date
    ? new Date(investigation.end_date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const tasks: Promise<any>[] = [
    earthquakes(startDate, endDate, investigation.latitude ?? undefined, investigation.longitude ?? undefined),
    sentinelCatalog(startDate, endDate),
    globalFishingWatchEvents(startDate, endDate)
  ];

  if (investigation.latitude !== null && investigation.longitude !== null) {
    tasks.push(osmFeatures(Number(investigation.latitude), Number(investigation.longitude)));
    tasks.push(aircraft(Number(investigation.latitude), Number(investigation.longitude)));
    tasks.push(
      historicalWeather(
        Number(investigation.latitude),
        Number(investigation.longitude),
        startDate,
        endDate
      )
    );
  }

  await query(
    "UPDATE investigations SET status='collecting', updated_at=now() WHERE id=$1 AND tenant_id=$2",
    [investigationId, tenantId]
  );

  const results = await Promise.allSettled(tasks);
  const inserted: Record<string, unknown>[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      inserted.push(
        await addEvidence(tenantId, investigationId, result.value as EvidenceItemInput)
      );
    } else {
      inserted.push(
        await addEvidence(tenantId, investigationId, {
          sourceType: "manual",
          title: "Provider error captured as evidence",
          capturedAt: new Date().toISOString(),
          payload: {
            error: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          },
          confidence: "reported"
        })
      );
    }
  }

  const evidenceRows = await query<Record<string, any>>(
    "SELECT * FROM evidence_items WHERE investigation_id=$1 AND tenant_id=$2 ORDER BY captured_at ASC",
    [investigationId, tenantId]
  );

  const timeline = deriveTimeline(evidenceRows);

  await query(
    "DELETE FROM investigation_events WHERE investigation_id=$1 AND tenant_id=$2",
    [investigationId, tenantId]
  );

  for (const event of timeline) {
    await query(
      "INSERT INTO investigation_events " +
        "(tenant_id, investigation_id, event_at, event_type, title, description, evidence_ids, confidence, source_type) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        tenantId,
        investigationId,
        event.eventAt,
        event.eventType,
        event.title,
        event.description ?? null,
        JSON.stringify(event.evidenceIds ?? []),
        event.confidence,
        event.sourceType
      ]
    );
  }

  await query(
    "UPDATE investigations SET status='complete', updated_at=now() WHERE id=$1 AND tenant_id=$2",
    [investigationId, tenantId]
  );

  return {
    investigationId,
    evidenceCount: inserted.length,
    timelineCount: timeline.length,
    evidence: inserted,
    timeline
  };
}

export async function investigationReport(
  tenantId: string,
  investigationId: string
): Promise<Record<string, unknown>> {
  const [investigation] = await query<Record<string, any>>(
    "SELECT * FROM investigations WHERE id=$1 AND tenant_id=$2",
    [investigationId, tenantId]
  );
  if (!investigation) throw new Error("Investigation not found");

  const evidence = await query<Record<string, any>>(
    "SELECT id, source_type, source_url, title, observed_at, captured_at, confidence, payload_sha256, metadata_json " +
      "FROM evidence_items WHERE investigation_id=$1 AND tenant_id=$2 ORDER BY captured_at ASC",
    [investigationId, tenantId]
  );

  const timeline = await query<Record<string, any>>(
    "SELECT id, event_at, event_type, title, description, evidence_ids, confidence, source_type " +
      "FROM investigation_events WHERE investigation_id=$1 AND tenant_id=$2 ORDER BY event_at ASC",
    [investigationId, tenantId]
  );

  return {
    reportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    investigation,
    methodology: [
      "Original source payloads are retained.",
      "Every payload is SHA-256 hashed at ingestion.",
      "Observations are separated from derived timeline events.",
      "Provider failures are captured rather than silently discarded.",
      "Source-specific caveats must be considered before a dispute conclusion is made."
    ],
    evidence,
    timeline
  };
}
