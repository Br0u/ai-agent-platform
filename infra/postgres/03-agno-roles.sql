DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_agno_migrator'
  ) THEN
    CREATE ROLE ai_agent_agno_migrator
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_agno'
  ) THEN
    CREATE ROLE ai_agent_agno
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE ai_agent_agno_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'agno_migrator_password';
ALTER ROLE ai_agent_agno
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'agno_runtime_password';

GRANT CONNECT ON DATABASE :DBNAME TO ai_agent_agno_migrator, ai_agent_agno;
REVOKE CREATE ON DATABASE :DBNAME FROM ai_agent_agno_migrator, ai_agent_agno;

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ai_agent_migrator;
GRANT USAGE ON SCHEMA public TO ai_agent_runtime, ai_agent_backup;
REVOKE ALL ON SCHEMA public FROM ai_agent_agno_migrator, ai_agent_agno;

CREATE SCHEMA IF NOT EXISTS agno AUTHORIZATION ai_agent_agno_migrator;
ALTER SCHEMA agno OWNER TO ai_agent_agno_migrator;
REVOKE ALL ON SCHEMA agno FROM PUBLIC;
REVOKE ALL ON SCHEMA agno FROM ai_agent_migrator, ai_agent_runtime;
GRANT USAGE, CREATE ON SCHEMA agno TO ai_agent_agno_migrator;
GRANT USAGE ON SCHEMA agno TO ai_agent_agno, ai_agent_backup;
REVOKE CREATE ON SCHEMA agno FROM ai_agent_agno, ai_agent_backup;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA agno
  FROM ai_agent_migrator, ai_agent_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA agno
  FROM ai_agent_migrator, ai_agent_runtime;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA agno FROM ai_agent_agno;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agno TO ai_agent_agno;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA agno FROM ai_agent_agno;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agno TO ai_agent_agno;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA agno FROM ai_agent_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA agno TO ai_agent_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA agno FROM ai_agent_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA agno TO ai_agent_backup;

SET ROLE ai_agent_agno_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_agent_agno;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT USAGE, SELECT ON SEQUENCES TO ai_agent_agno;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT ON TABLES TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  REVOKE USAGE, UPDATE ON SEQUENCES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT ON SEQUENCES TO ai_agent_backup;
RESET ROLE;

DO $$
BEGIN
  IF has_schema_privilege('ai_agent_agno', 'public', 'USAGE')
    OR has_schema_privilege('ai_agent_agno_migrator', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Agno roles must not access the platform schema';
  END IF;
  IF has_schema_privilege('ai_agent_runtime', 'agno', 'USAGE')
    OR has_schema_privilege('ai_agent_migrator', 'agno', 'USAGE') THEN
    RAISE EXCEPTION 'platform roles must not access the Agno schema';
  END IF;
  IF has_schema_privilege('ai_agent_agno', 'agno', 'CREATE')
    OR has_schema_privilege('ai_agent_backup', 'agno', 'CREATE') THEN
    RAISE EXCEPTION 'Agno runtime and backup roles must not create objects';
  END IF;
END
$$;
