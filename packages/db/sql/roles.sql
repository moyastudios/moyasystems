-- Westbridge database roles. Run as the schema owner after every migration (idempotent):
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles.sql
-- Set passwords separately (never commit them):
--   ALTER ROLE wb_api PASSWORD '...';  ALTER ROLE wb_config PASSWORD '...';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wb_api') THEN CREATE ROLE wb_api LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wb_config') THEN CREATE ROLE wb_config LOGIN; END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM wb_api, wb_config;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM wb_api, wb_config;
GRANT USAGE ON SCHEMA public TO wb_api, wb_config;

-- ── API (api.moya-studios.xyz) ──
-- Reads config; never writes it. Cannot see passkeys or dashboard sessions.
GRANT SELECT ON ranks, permissions, quota_rules, settings TO wb_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, link_codes, staff, cases, help_calls, loa,
  game_sessions, request_nonces, idempotency_keys, rate_limit_buckets TO wb_api;
GRANT SELECT, UPDATE ON connectivity_checks TO wb_api;
-- Audit log is append-only: insert, read ids back, mark as mirrored.
GRANT INSERT ON audit_log TO wb_api;
GRANT SELECT (id, actor, action, payload, ip, created_at, mirrored_at) ON audit_log TO wb_api;
GRANT UPDATE (mirrored_at) ON audit_log TO wb_api;
GRANT USAGE ON SEQUENCE audit_log_id_seq, cases_case_no_seq TO wb_api;

-- ── Config dashboard (config.moya-studios.xyz) ──
-- Owns config; cannot touch moderation data.
GRANT SELECT, INSERT, UPDATE, DELETE ON ranks, permissions, quota_rules, settings, config_versions,
  passkeys, dashboard_sessions, auth_challenges, owner_invites, rate_limit_buckets, connectivity_checks TO wb_config;
GRANT SELECT ON users, staff TO wb_config;
GRANT INSERT ON audit_log TO wb_config;
GRANT SELECT (id, actor, action, payload, ip, created_at, mirrored_at) ON audit_log TO wb_config;
GRANT UPDATE (mirrored_at) ON audit_log TO wb_config;
GRANT USAGE ON SEQUENCE audit_log_id_seq, config_versions_version_seq TO wb_config;
