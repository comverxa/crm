-- COMVERXA P0 Omnichannel SQLite schema — development migration ONLY.
-- Apply to a new empty staging database first; NEVER directly to production.
-- Tenant IDs and user IDs are resolved by authenticated CRM server code.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS omnichannel_channels (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  provider TEXT NOT NULL CHECK(provider IN ('meta','evolution')),
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, slot),
  UNIQUE (tenant_id, provider, external_id)
);

CREATE TABLE IF NOT EXISTS omnichannel_conversations (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  assigned_to TEXT,
  last_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, channel_id, phone),
  FOREIGN KEY (tenant_id, channel_id)
    REFERENCES omnichannel_channels(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS omnichannel_messages (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  provider_message_id TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  kind TEXT NOT NULL CHECK(kind IN ('text','image','audio','document','video')),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  mime_type TEXT,
  file_name TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES omnichannel_conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, channel_id)
    REFERENCES omnichannel_channels(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS omnichannel_message_dedup
  ON omnichannel_messages(tenant_id, channel_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS omnichannel_labels (
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (tenant_id, conversation_id, label),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES omnichannel_conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS omnichannel_outbox (
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','sending','accepted','unknown','failed')),
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, request_id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES omnichannel_conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, channel_id)
    REFERENCES omnichannel_channels(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS omnichannel_conversation_recent
  ON omnichannel_conversations(tenant_id, last_at DESC);
CREATE INDEX IF NOT EXISTS omnichannel_message_history
  ON omnichannel_messages(tenant_id, conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS omnichannel_outbox_queue
  ON omnichannel_outbox(state, created_at);
-- This schema does not itself enforce user roles, ownership or valid state
-- transitions. All queries MUST scope tenant_id; transactions, lease-based
-- claiming, retries and delivery status reconciliation remain to implement.
