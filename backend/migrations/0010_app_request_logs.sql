-- App request logs — persists one row per authenticated ext API call.
-- Used to power the analytics dashboard in Connected Apps → App Detail.

CREATE TABLE IF NOT EXISTS app_request_logs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id      uuid        NOT NULL REFERENCES connected_apps(id) ON DELETE CASCADE,
    tenant_id   uuid        NOT NULL,
    method      text        NOT NULL,
    path        text        NOT NULL,
    status_code integer     NOT NULL,
    latency_ms  integer,
    ip_address  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_req_logs_app_time
    ON app_request_logs(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_req_logs_tenant_time
    ON app_request_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_req_logs_status
    ON app_request_logs(app_id, status_code);
