CREATE TABLE IF NOT EXISTS investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  query_text TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','collecting','complete','closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence TEXT NOT NULL DEFAULT 'reported' CHECK (confidence IN ('observed','reported','derived','inferred')),
  payload_json JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS investigation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  event_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL,
  source_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investigation_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  value_json JSONB NOT NULL,
  source_evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('original','extracted','derived','interpretation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workforce_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  adapter TEXT NOT NULL CHECK (adapter IN ('browserSkill','playwright','file','email','api')),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','idle','busy','error')),
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workforce_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES workforce_agents(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  instruction TEXT NOT NULL,
  adapter TEXT NOT NULL CHECK (adapter IN ('browserSkill','playwright','file','email','api')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','blocked','cancelled')),
  result_json JSONB,
  error_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES workforce_agents(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'BrowserSkill',
  session_ref TEXT,
  allowed_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','active','paused','closed','error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES workforce_tasks(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investigations_tenant ON investigations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON evidence_items(tenant_id, investigation_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_items(payload_sha256);
CREATE INDEX IF NOT EXISTS idx_investigation_events ON investigation_events(tenant_id, investigation_id, event_at);
CREATE INDEX IF NOT EXISTS idx_workforce_tasks_queue ON workforce_tasks(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_action_audit_task ON action_audit(tenant_id, task_id, created_at);

CREATE OR REPLACE FUNCTION update_investigation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS investigation_updated_at ON investigations;
CREATE TRIGGER investigation_updated_at
BEFORE UPDATE ON investigations
FOR EACH ROW
EXECUTE FUNCTION update_investigation_updated_at();
