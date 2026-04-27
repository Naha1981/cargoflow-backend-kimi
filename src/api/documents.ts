import { Router } from "express";
import { writeFileSync, mkdirSync, createReadStream } from "fs";
import { join, extname } from "path";
import { v4 as uuidv4 } from "uuid";
import { query } from "../lib/db";
import { authMiddleware, AuthenticatedRequest, requireRoles } from "./middleware";
import { emitEvent, EventTypes } from "../lib/event-emitter";
import { logger } from "../lib/logger";

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || "52428800", 10);

mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/bmp",
  "image/tiff",
];

/**
 * POST /api/documents/upload
 */
router.post("/upload", authMiddleware, requireRoles("admin", "ops", "mining", "oil"), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { fileBase64, filename, mimeType } = req.body;

    if (!fileBase64 || !filename) {
      return res.status(400).json({ error: "fileBase64 and filename are required" });
    }

    if (!ALLOWED_MIMES.includes(mimeType)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: "File too large" });
    }

    const ext = extname(filename) || ".bin";
    const uniqueName = `${uuidv4()}${ext}`;
    const filePath = join(UPLOAD_DIR, uniqueName);

    writeFileSync(filePath, buffer);

    const idempotencyKey = `${tenantId}-${uniqueName}`;

    const rows = await query<{ id: string }>(
      `INSERT INTO workflow_runs (tenant_id, idempotency_key, workflow_type, status, file_path)
       VALUES ($1, $2, 'document_pipeline', 'started', $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [tenantId, idempotencyKey, filePath]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: "Duplicate upload" });
    }

    const runId = rows[0].id;

    await emitEvent({
      tenantId,
      eventType: EventTypes.DOCUMENT_INTAKE_STARTED,
      source: "documents-api",
      partitionKey: runId,
      payload: { runId, filePath, filename, size: buffer.length },
    });

    logger.info({ tenantId, runId, filePath }, "Document uploaded");
    return res.status(201).json({ runId, filePath, filename });
  } catch (err) {
    logger.error({ err }, "Upload failed");
    return res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * GET /api/documents
 */
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { limit = "50", offset = "0" } = req.query;

    const rows = await query(
      `SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, parseInt(limit as string), parseInt(offset as string)]
    );

    return res.json({ documents: rows });
  } catch (err) {
    logger.error({ err }, "Failed to list documents");
    return res.status(500).json({ error: "Failed to list documents" });
  }
});

/**
 * GET /api/documents/download/:filename
 * Serve uploaded files securely.
 */
router.get("/download/:filename", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(UPLOAD_DIR, filename);

    // Security: prevent directory traversal
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return res.status(403).json({ error: "Invalid path" });
    }

    return createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error({ err }, "File download failed");
    return res.status(404).json({ error: "File not found" });
  }
});

export { router as documentsRouter };
