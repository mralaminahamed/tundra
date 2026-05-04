-- P7 Sub-pass E: Metrics & Alerting schema
-- Partitioned metrics table (pg_partman manages daily partitions)
CREATE TABLE metrics_samples (
    id              bigserial        NOT NULL,
    occurred_at     timestamptz      NOT NULL,
    scope_type      text             NOT NULL CHECK (scope_type IN ('server','site','application','database')),
    scope_id        uuid             NOT NULL,
    metric          text             NOT NULL,
    value           double precision NOT NULL,
    labels          jsonb            NOT NULL DEFAULT '{}'::jsonb
) PARTITION BY RANGE (occurred_at);

-- Base index on the partition template
CREATE INDEX idx_metrics_scope_time ON metrics_samples (scope_type, scope_id, metric, occurred_at DESC);

-- Initial partitions for current + next two months
CREATE TABLE metrics_samples_p2026_05 PARTITION OF metrics_samples
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE metrics_samples_p2026_06 PARTITION OF metrics_samples
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE metrics_samples_p2026_07 PARTITION OF metrics_samples
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Real-time event subscription tracking
CREATE TABLE event_subscriptions (
    id              uuid             PRIMARY KEY DEFAULT uuidv7(),
    session_id      uuid             NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    channel         text             NOT NULL,
    created_at      timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_subscriptions_session ON event_subscriptions(session_id);

-- WebSocket session tracking
CREATE TABLE websocket_sessions (
    id              uuid             PRIMARY KEY DEFAULT uuidv7(),
    session_id      uuid             NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    connected_at    timestamptz      NOT NULL DEFAULT now(),
    last_ping_at    timestamptz      NOT NULL DEFAULT now(),
    remote_ip       inet,
    user_agent      text
);

-- Alert rules
CREATE TABLE alert_rules (
    id              uuid             PRIMARY KEY DEFAULT uuidv7(),
    name            text             NOT NULL,
    description     text,
    scope_type      text             NOT NULL CHECK (scope_type IN ('server','site','application','database','global')),
    scope_id        uuid,            -- NULL means all resources of that scope_type
    metric          text             NOT NULL,
    condition       text             NOT NULL CHECK (condition IN ('gt','lt','gte','lte','eq')),
    threshold       double precision NOT NULL,
    duration_secs   int              NOT NULL DEFAULT 300,  -- must be true for this long
    severity        text             NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
    channels        jsonb            NOT NULL DEFAULT '[]'::jsonb,  -- delivery channels config
    is_enabled      boolean          NOT NULL DEFAULT true,
    created_by      uuid             REFERENCES operators(id) ON DELETE SET NULL,
    created_at      timestamptz      NOT NULL DEFAULT now(),
    updated_at      timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_enabled ON alert_rules(scope_type, metric) WHERE is_enabled = true;

CREATE TRIGGER trg_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Alert deliveries (fired alerts)
CREATE TABLE alert_deliveries (
    id              uuid             PRIMARY KEY DEFAULT uuidv7(),
    rule_id         uuid             NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    scope_id        uuid,
    fired_at        timestamptz      NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    current_value   double precision NOT NULL,
    threshold       double precision NOT NULL,
    channels_tried  jsonb            NOT NULL DEFAULT '[]'::jsonb,
    delivery_status text             NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','delivered','failed','suppressed')),
    error           text
);

CREATE INDEX idx_alert_deliveries_active ON alert_deliveries(rule_id, fired_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_alert_deliveries_recent ON alert_deliveries(fired_at DESC);
