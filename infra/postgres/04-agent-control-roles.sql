\getenv control_migrator_password AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD
\getenv control_runtime_password AGENT_CONTROL_DATABASE_PASSWORD

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_control_migrator'
  ) THEN
    CREATE ROLE ai_agent_control_migrator
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_control'
  ) THEN
    CREATE ROLE ai_agent_control
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE ai_agent_control_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'control_migrator_password';
ALTER ROLE ai_agent_control
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'control_runtime_password';

CREATE SCHEMA IF NOT EXISTS agent_control
  AUTHORIZATION ai_agent_control_migrator;
ALTER SCHEMA agent_control OWNER TO ai_agent_control_migrator;

GRANT CONNECT ON DATABASE :"DBNAME"
  TO ai_agent_control_migrator, ai_agent_control;
REVOKE CREATE ON DATABASE :"DBNAME"
  FROM ai_agent_control_migrator, ai_agent_control;
REVOKE ALL ON SCHEMA public
  FROM ai_agent_control_migrator, ai_agent_control;
