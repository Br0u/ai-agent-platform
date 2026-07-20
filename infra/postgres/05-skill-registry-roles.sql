\getenv skill_registry_migrator_password SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD
\getenv skill_registry_manager_password SKILL_REGISTRY_DATABASE_PASSWORD
\getenv skill_registry_runtime_password SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_skill_registry_migrator'
  ) THEN
    CREATE ROLE ai_agent_skill_registry_migrator
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_skill_registry_manager'
  ) THEN
    CREATE ROLE ai_agent_skill_registry_manager
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_skill_registry_runtime'
  ) THEN
    CREATE ROLE ai_agent_skill_registry_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE ai_agent_skill_registry_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_migrator_password';
ALTER ROLE ai_agent_skill_registry_manager
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_manager_password';
ALTER ROLE ai_agent_skill_registry_runtime
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_runtime_password';

CREATE SCHEMA IF NOT EXISTS skill_registry
  AUTHORIZATION ai_agent_skill_registry_migrator;
ALTER SCHEMA skill_registry OWNER TO ai_agent_skill_registry_migrator;

GRANT CONNECT ON DATABASE :"DBNAME"
  TO ai_agent_skill_registry_migrator,
     ai_agent_skill_registry_manager,
     ai_agent_skill_registry_runtime;
REVOKE TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT TEMPORARY ON DATABASE :"DBNAME"
  TO ai_agent_migrator, ai_agent_runtime, ai_agent_backup,
     ai_agent_agno_migrator, ai_agent_agno;
REVOKE TEMPORARY ON DATABASE :"DBNAME"
  FROM ai_agent_skill_registry_migrator,
       ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime;
REVOKE CREATE ON DATABASE :"DBNAME"
  FROM ai_agent_skill_registry_migrator,
       ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime;
REVOKE ALL ON SCHEMA public
  FROM ai_agent_skill_registry_migrator,
       ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime;
