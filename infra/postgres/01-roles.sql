\getenv migrator_password MIGRATOR_DATABASE_PASSWORD
\getenv runtime_password RUNTIME_DATABASE_PASSWORD
\getenv backup_password BACKUP_DATABASE_PASSWORD

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_migrator') THEN
    CREATE ROLE ai_agent_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_runtime') THEN
    CREATE ROLE ai_agent_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_backup') THEN
    CREATE ROLE ai_agent_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER ROLE ai_agent_migrator PASSWORD :'migrator_password';
ALTER ROLE ai_agent_runtime PASSWORD :'runtime_password';
ALTER ROLE ai_agent_backup PASSWORD :'backup_password';
GRANT CONNECT ON DATABASE :DBNAME TO ai_agent_migrator, ai_agent_runtime, ai_agent_backup;
GRANT CREATE ON DATABASE :DBNAME TO ai_agent_migrator;
REVOKE CREATE ON DATABASE :DBNAME FROM ai_agent_runtime, ai_agent_backup;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ai_agent_migrator;
GRANT USAGE ON SCHEMA public TO ai_agent_runtime, ai_agent_backup;
REVOKE CREATE ON SCHEMA public FROM ai_agent_runtime, ai_agent_backup;

SET ROLE ai_agent_migrator;
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
RESET ROLE;
