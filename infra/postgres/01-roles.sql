DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_migrator') THEN
    CREATE ROLE ai_agent_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_runtime') THEN
    CREATE ROLE ai_agent_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER ROLE ai_agent_migrator PASSWORD :'migrator_password';
ALTER ROLE ai_agent_runtime PASSWORD :'runtime_password';
GRANT CONNECT ON DATABASE :DBNAME TO ai_agent_migrator, ai_agent_runtime;
GRANT CREATE ON DATABASE :DBNAME TO ai_agent_migrator;
REVOKE CREATE ON DATABASE :DBNAME FROM ai_agent_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO ai_agent_migrator;
GRANT USAGE ON SCHEMA public TO ai_agent_runtime;
REVOKE CREATE ON SCHEMA public FROM ai_agent_runtime;

SET ROLE ai_agent_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_agent_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ai_agent_runtime;
RESET ROLE;
