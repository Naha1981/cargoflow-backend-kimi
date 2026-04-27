import * as Sentry from "@sentry/node";
import { logger } from "./logger";
import { query } from "./db";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    maxBreadcrumbs: 50,
    attachStacktrace: true,
  });
  logger.info("Sentry initialized");
} else {
  logger.warn("SENTRY_DSN not set; error tracking disabled");
}

export { Sentry };

/**
 * Safe runner wrapper for Trigger.dev tasks.
 * Logs the error, captures it in Sentry, updates workflow_runs.status to 'failed',
 * and rethrows so Trigger.dev applies its retry policy.
 */
export async function safeRun<T>(
  opts: { runId?: string; tenantId?: string; taskName: string },
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    logger.error(
      { err, ...opts },
      `Task ${opts.taskName} failed`
    );

    if (dsn) {
      Sentry.captureException(err, {
        tags: {
          task: opts.taskName,
          tenantId: opts.tenantId || "unknown",
          runId: opts.runId || "unknown",
        },
        contexts: {
          task: {
            name: opts.taskName,
            runId: opts.runId,
            tenantId: opts.tenantId,
          },
        },
      });
    }

    if (opts.runId && opts.tenantId) {
      try {
        await query(
          `UPDATE workflow_runs
           SET status = 'failed',
               processing_error = $3,
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [opts.runId, opts.tenantId, err.message || "Unknown error"]
        );
      } catch (dbErr) {
        logger.error({ dbErr, runId: opts.runId }, "Failed to update workflow_runs status");
      }
    }

    throw err;
  }
}
