-- ============================================================
-- CargoFlow Database Schema — Phase 1 (Complete, Final)
-- ============================================================
-- Run this before any application code.
-- Designed for: multi-tenant SaaS, event-driven architecture,
-- append-only event log, and AI-native operational intelligence.
-- ============================================================

-- --------------------------------------------------------
-- Extensions
-- --------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------
-- Tenants
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','pro','enterprise')),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','ops','compliance','finance','mining','oil','viewer')),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Team invites
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Workflow runs (append-only log with full metadata)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key  TEXT UNIQUE,
  workflow_type    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','processing','completed','failed','awaiting_approval')),
  file_path        TEXT,
  extracted_data   JSONB,
  metadata         JSONB,
  confidence       FLOAT,
  processing_error TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Shipments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_code TEXT,
  supplier      TEXT,
  origin        TEXT,
  destination   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  risk_level    TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  value         NUMERIC(18,2),
  currency      TEXT DEFAULT 'USD',
  incoterm      TEXT,
  commodity     TEXT,
  vessel        TEXT,
  carrier       TEXT,
  etd           TIMESTAMP WITH TIME ZONE,
  eta           TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Documents
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id    UUID REFERENCES shipments(id) ON DELETE SET NULL,
  doc_type       TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  extracted_json JSONB,
  confidence     FLOAT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed','rejected')),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Costs (single-insert atomic margin + flags)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id     UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  freight         NUMERIC(18,2) DEFAULT 0,
  duty            NUMERIC(18,2) DEFAULT 0,
  vat             NUMERIC(18,2) DEFAULT 0,
  insurance       NUMERIC(18,2) DEFAULT 0,
  transport       NUMERIC(18,2) DEFAULT 0,
  total_cost      NUMERIC(18,2) DEFAULT 0,
  margin          NUMERIC(6,2) DEFAULT 0,
  low_margin_flag BOOLEAN DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Alerts
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  severity    TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT false,
  escalated   BOOLEAN DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Human approval gates
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_run_id  UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMP WITH TIME ZONE,
  notes            TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- AI insights
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id      UUID REFERENCES shipments(id) ON DELETE CASCADE,
  summary          TEXT,
  risks            JSONB,
  opportunities    JSONB,
  recommendations  JSONB,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Mine projects (domain-specific)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS mine_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_name  TEXT,
  permit_number TEXT,
  status        TEXT,
  location      TEXT,
  commodity     TEXT,
  contractor    TEXT,
  permit_expiry TIMESTAMP WITH TIME ZONE,
  environmental_flag BOOLEAN DEFAULT false,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mine_projects_permit ON mine_projects(tenant_id, permit_number) WHERE permit_number IS NOT NULL;

-- --------------------------------------------------------
-- Oil cargo operations (domain-specific)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS oil_cargos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vessel         TEXT,
  imo_number     TEXT,
  cargo_type     TEXT,
  volume_bbls    NUMERIC(18,2),
  volume_reconciled BOOLEAN DEFAULT false,
  quality_passed    BOOLEAN DEFAULT false,
  loading_port      TEXT,
  discharge_port    TEXT,
  status            TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oil_cargos_imo ON oil_cargos(tenant_id, imo_number) WHERE imo_number IS NOT NULL;

-- --------------------------------------------------------
-- Event stream (Kafka-style append-only log)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_stream (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  event_type     TEXT NOT NULL,
  source         TEXT,
  partition_key  TEXT,
  payload        JSONB NOT NULL,
  processed      BOOLEAN DEFAULT false,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- --------------------------------------------------------
-- Performance Indexes
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shipments_tenant     ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status     ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_risk       ON shipments(risk_level);
CREATE INDEX IF NOT EXISTS idx_shipments_code       ON shipments(shipment_code);
CREATE INDEX IF NOT EXISTS idx_documents_shipment   ON documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant     ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant        ON alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unread        ON alerts(tenant_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_alerts_shipment        ON alerts(shipment_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status   ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant   ON workflow_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_idemp    ON workflow_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_costs_shipment         ON costs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_costs_tenant           ON costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_run          ON approvals(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant       ON approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_shipment   ON ai_insights(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant     ON ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mine_projects_tenant   ON mine_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oil_cargos_tenant      ON oil_cargos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oil_cargos_vessel      ON oil_cargos(vessel);
CREATE INDEX IF NOT EXISTS idx_event_stream_tenant    ON event_stream(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_stream_unprocessed ON event_stream(processed, created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_event_stream_partition   ON event_stream(partition_key);
CREATE INDEX IF NOT EXISTS idx_invites_tenant         ON invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant           ON users(tenant_id);

-- --------------------------------------------------------
-- Updated-at trigger for workflow_runs
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_workflow_runs_updated_at ON workflow_runs;
CREATE TRIGGER update_workflow_runs_updated_at
  BEFORE UPDATE ON workflow_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
