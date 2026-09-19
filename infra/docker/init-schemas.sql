-- One schema per bounded context / read model. Runs on first volume init (docker-entrypoint-initdb.d)
-- and on every `postgres-init` run; every statement is idempotent.
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS checkout;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS search;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Trigram matching for the search read model. Lives in `public` so the dev schema and the
-- `search_test` schema share it; reference it as public.similarity / public.gin_trgm_ops.
-- Skipped with a notice when the role may not create extensions.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
  RAISE NOTICE 'pg_trgm not created: %', SQLERRM;
END
$$;
