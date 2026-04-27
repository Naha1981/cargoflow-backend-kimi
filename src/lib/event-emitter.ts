import { query } from "./db";
import { logger } from "./logger";

const WS_PUBLISH_URL = process.env.WS_SERVER_URL
  ? `${process.env.WS_SERVER_URL}/publish`
  : "http://localhost:3001/publish";

/**
 * Emits an event into the event_stream table and optionally
 * forwards it to the WebSocket server's /publish endpoint.
 *
 * This is the single point of contact between workflow tasks
 * and the real-time layer.
 */
export async function emitEvent(opts: {
  tenantId: string;
  eventType: string;
  source?: string;
  partitionKey?: string;
  payload: Record<string, any>;
  skipWebsocket?: boolean;
}): Promise<{ eventId: string }> {
  const { tenantId, eventType, source, partitionKey, payload, skipWebsocket } = opts;

  const rows = await query<{ id: string }>(
    `INSERT INTO event_stream (tenant_id, event_type, source, partition_key, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantId, eventType, source || "system", partitionKey || tenantId, JSON.stringify(payload)]
  );

  const eventId = rows[0]?.id;

  if (!skipWebsocket) {
    try {
      await fetch(WS_PUBLISH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          eventType,
          source: source || "system",
          payload,
          eventId,
        }),
      });
    } catch (err) {
      logger.warn({ err, eventType, tenantId }, "WebSocket publish failed; event persisted in DB");
    }
  }

  return { eventId };
}

/**
 * Type-safe event type enumeration.
 */
export const EventTypes = {
  // AI events
  AI_EXTRACTION_STARTED: "AI_EXTRACTION_STARTED",
  AI_EXTRACTION_COMPLETE: "AI_EXTRACTION_COMPLETE",

  // Shipment events
  SHIPMENT_CREATED: "SHIPMENT_CREATED",
  SHIPMENT_UPDATED: "SHIPMENT_UPDATED",
  SHIPMENT_REJECTED: "SHIPMENT_REJECTED",

  // Compliance events
  COMPLIANCE_CHECKED: "COMPLIANCE_CHECKED",
  MISSING_DOCS_ALERT: "MISSING_DOCS_ALERT",

  // Finance events
  COST_CALCULATED: "COST_CALCULATED",
  LOW_MARGIN_DETECTED: "LOW_MARGIN_DETECTED",

  // Tracking events
  TRACKING_UPDATED: "TRACKING_UPDATED",
  DELAY_DETECTED: "DELAY_DETECTED",

  // Risk events
  RISK_SCORED: "RISK_SCORED",
  ALERT_CREATED: "ALERT_CREATED",

  // System events
  DOCUMENT_INTAKE_STARTED: "DOCUMENT_INTAKE_STARTED",
  OCR_COMPLETED: "OCR_COMPLETED",
  DOCUMENT_CLASSIFIED: "DOCUMENT_CLASSIFIED",
  WORKFLOW_STARTED: "WORKFLOW_STARTED",
  WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED",
  WORKFLOW_FAILED: "WORKFLOW_FAILED",
  EXECUTIVE_SUMMARY_GENERATED: "EXECUTIVE_SUMMARY_GENERATED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  APPROVAL_RESOLVED: "APPROVAL_RESOLVED",
} as const;
