GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_agent_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_agent_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ai_agent_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_agent_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ai_agent_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_agent_backup;
GRANT USAGE ON SCHEMA drizzle TO ai_agent_backup;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA drizzle FROM ai_agent_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO ai_agent_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA drizzle FROM ai_agent_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_agent_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ai_agent_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, UPDATE ON SEQUENCES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  GRANT SELECT ON TABLES TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  REVOKE USAGE, UPDATE ON SEQUENCES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  GRANT SELECT ON SEQUENCES TO ai_agent_backup;
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM ai_agent_runtime;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'ai_agent_backup'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
  ) THEN
    RAISE EXCEPTION 'ai_agent_backup role attributes violate the privilege matrix';
  END IF;
  IF has_database_privilege('ai_agent_backup', current_database(), 'CREATE')
    OR has_schema_privilege('ai_agent_backup', 'public', 'CREATE')
    OR has_schema_privilege('ai_agent_backup', 'drizzle', 'CREATE') THEN
    RAISE EXCEPTION 'ai_agent_backup must not create database objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        NOT has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'SELECT')
        OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'INSERT')
        OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'UPDATE')
        OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'DELETE')
      )
  ) THEN
    RAISE EXCEPTION 'ai_agent_backup table privileges violate the privilege matrix';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_sequences
    WHERE schemaname = 'public'
      AND (
        NOT has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'SELECT')
        OR has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'USAGE')
        OR has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'UPDATE')
      )
  ) THEN
    RAISE EXCEPTION 'ai_agent_backup sequence privileges violate the privilege matrix';
  END IF;
  IF NOT has_schema_privilege('ai_agent_backup', 'drizzle', 'USAGE')
    OR EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'drizzle'
        AND (
          NOT has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'SELECT')
          OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'INSERT')
          OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'UPDATE')
          OR has_table_privilege('ai_agent_backup', format('%I.%I', schemaname, tablename), 'DELETE')
        )
    ) THEN
    RAISE EXCEPTION 'ai_agent_backup migration metadata privileges violate the privilege matrix';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_sequences
    WHERE schemaname = 'drizzle'
      AND (
        NOT has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'SELECT')
        OR has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'USAGE')
        OR has_sequence_privilege('ai_agent_backup', format('%I.%I', schemaname, sequencename), 'UPDATE')
      )
  ) THEN
    RAISE EXCEPTION 'ai_agent_backup migration metadata sequence privileges violate the privilege matrix';
  END IF;
END $$;
