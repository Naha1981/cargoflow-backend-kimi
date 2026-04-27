# CargoFlow — AEP Operations Intelligence System

**Version:** 1.0  
**Stack:** Node.js · TypeScript · PostgreSQL · Trigger.dev v3 · Tesseract.js · WebSocket · Next.js  
**Architecture:** Multi-tenant SaaS · Event-driven · Real-time · AI-native

---

## Overview

CargoFlow is an AI-native operational intelligence platform for companies that move physical goods — ships, mines, oil. It provides a single pane of glass showing what is moving, what is at risk, what is costing too much, and what needs a human decision.

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| API | Express + TypeScript | REST API, auth, metrics |
| Worker | Trigger.dev v3 | Event-driven task orchestration |
| Real-time | WebSocket (ws) | Tenant-scoped broadcast server |
| Database | PostgreSQL 15 | Multi-tenant schema + event log |
| AI | Kimi (Moonshot) k2.6 | Document extraction, compliance, risk |
| OCR | Tesseract.js + pdf-poppler | PDF-to-image + text extraction |
| Frontend | Next.js 14 + Tailwind | Bloomberg-style dark dashboard |

## Project Structure

```
cargoflow/
├── trigger/tasks/          # Trigger.dev tasks (17+ tasks)
│   ├── document-pipeline.ts      # Orchestrator
│   ├── document-intake.ts
│   ├── ocr-extraction.ts
│   ├── document-classification.ts
│   ├── ai-extraction.ts
│   ├── shipment-create.ts
│   ├── shipment-update.ts
│   ├── compliance-check.ts
│   ├── missing-docs.ts
│   ├── cost-calculation.ts
│   ├── margin-analysis.ts
│   ├── tracking-update.ts
│   ├── delay-detection.ts
│   ├── alert-generator.ts
│   ├── risk-scoring.ts
│   ├── approval-gate.ts
│   ├── mine-processing.ts
│   ├── oil-cargo-processing.ts
│   ├── executive-summary.ts
│   ├── tracking-cron.ts
│   └── summary-cron.ts
├── src/
│   ├── api/
│   │   ├── server.ts       # Express app
│   │   ├── auth.ts         # Signup / login / JWT
│   │   ├── middleware.ts   # Auth + RBAC
│   │   ├── approvals.ts    # Approval API
│   │   ├── shipments.ts    # Shipment API
│   │   ├── alerts.ts       # Alert API
│   │   └── documents.ts    # Upload API
│   ├── lib/
│   │   ├── db.ts           # Pool + tenant-safe queries
│   │   ├── logger.ts       # Pino structured logging
│   │   ├── sentry.ts       # Error tracking + safeRun
│   │   ├── event-emitter.ts# Event stream + WebSocket publish
│   │   ├── ai.ts           # Kimi API client + system prompts
│   │   └── ocr.ts          # Tesseract + PDF conversion
│   ├── workers/
│   │   └── event-consumer.ts # Postgres event consumer loop
│   └── realtime/
│       └── server.ts       # WebSocket broadcast server
├── sql/
│   ├── 001_schema.sql      # Full database schema
│   └── migrate.ts          # Migration runner
├── frontend/               # Next.js 14 app
│   ├── app/
│   │   ├── dashboard/
│   │   ├── shipments/
│   │   ├── documents/
│   │   ├── compliance/
│   │   ├── costs/
│   │   ├── mines/
│   │   ├── oil/
│   │   ├── alerts/
│   │   ├── settings/
│   │   ├── login/
│   │   └── layout.tsx
│   ├── components/
│   ├── hooks/
│   │   └── useRealtimeStream.ts
│   └── lib/
│       └── api.ts
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── Dockerfile.realtime
├── docker-compose.yml
├── trigger.config.ts
└── .github/workflows/ci.yml
```

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 2. Database

```bash
docker compose up -d db
npm run db:migrate
```

### 3. Install & Run

```bash
npm install
cd frontend && npm install && cd ..

# Terminal 1 — API
npm run dev

# Terminal 2 — Realtime
npm run dev:realtime

# Terminal 3 — Event Consumer
npm run dev:worker

# Terminal 4 — Trigger.dev (local dev)
npx trigger.dev@latest dev

# Terminal 5 — Frontend
cd frontend && npm run dev
```

## Key Design Decisions

- **Tenant-safe queries**: Every DB write includes `tenant_id`. The `tenantQuery` helper enforces this.
- **Idempotency**: `document-intake` uses `INSERT ... ON CONFLICT DO NOTHING` on `idempotency_key`.
- **Task chaining**: Only `document-pipeline` chains tasks via `tasks.triggerAndWait`. Individual tasks are independently retryable.
- **PDF support**: `pdf-poppler` converts PDFs to images before Tesseract OCR.
- **Single-insert costs**: Cost and margin are set atomically in one insert, avoiding race conditions.
- **Separate WebSocket process**: The realtime server scales independently from the API.
- **Event-driven**: All state changes emit to `event_stream` and forward to WebSocket clients.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | None | Health check |
| POST | /api/auth/signup | None | Create tenant + admin |
| POST | /api/auth/login | None | Authenticate |
| GET | /api/me | JWT | Current user |
| GET | /api/metrics | API Key | Prometheus metrics |
| GET | /api/shipments | JWT | List shipments |
| GET | /api/shipments/:id | JWT | Shipment detail |
| GET | /api/alerts | JWT | List alerts |
| PATCH | /api/alerts/:id | JWT | Update alert |
| GET | /api/documents | JWT | List documents |
| POST | /api/documents/upload | JWT + Role | Upload file |
| GET | /api/approvals | JWT + Role | List approvals |
| PATCH | /api/approvals/:id | JWT + Role | Resolve approval |

## Security Checklist

- Parameterized queries everywhere — no string interpolation
- JWT on all protected routes
- `tenant_id` on every DB query
- API keys redacted from logs via Pino `redact`
- File uploads validated for MIME type and size
- WebSocket `/publish` bound to internal network
- bcrypt cost factor 12

## License

MIT
