import { pool } from "../lib/db";
import { emitEvent } from "../lib/event-emitter";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 100;

async function processEvents() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const events = await client.query(
      `SELECT id, tenant_id, event_type, source, partition_key, payload
       FROM event_stream
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    if (events.rowCount === 0) {
      await client.query("COMMIT");
      return;
    }

    for (const event of events.rows) {
      try {
        // Re-emit to WebSocket (idempotent since event_stream already persisted)
        await emitEvent({
          tenantId: event.tenant_id,
          eventType: event.event_type,
          source: event.source,
          partitionKey: event.partition_key,
          payload: event.payload,
          skipWebsocket: false,
        });

        await client.query(
          `UPDATE event_stream SET processed = true WHERE id = $1`,
          [event.id]
        );
      } catch (err) {
        logger.error({ err, eventId: event.id }, "Failed to process event");
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Event consumer batch failed");
  } finally {
    client.release();
  }
}

async function runConsumer() {
  logger.info("Event consumer started");
  while (true) {
    try {
      await processEvents();
    } catch (err) {
      logger.error({ err }, "Event consumer loop error");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

runConsumer();
