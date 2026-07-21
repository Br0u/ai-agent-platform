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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles AS member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname IN (
      'ai_agent_skill_registry_migrator',
      'ai_agent_skill_registry_manager',
      'ai_agent_skill_registry_runtime'
    )
    OR member_role.rolname IN (
      'ai_agent_skill_registry_migrator',
      'ai_agent_skill_registry_manager',
      'ai_agent_skill_registry_runtime'
    )
  ) THEN
    RAISE EXCEPTION 'skill registry roles must not have role memberships'
      USING ERRCODE = '42501';
  END IF;
END
$$;

ALTER ROLE ai_agent_skill_registry_migrator RESET ALL;
ALTER ROLE ai_agent_skill_registry_manager RESET ALL;
ALTER ROLE ai_agent_skill_registry_runtime RESET ALL;
ALTER ROLE ai_agent_skill_registry_migrator IN DATABASE :"DBNAME" RESET ALL;
ALTER ROLE ai_agent_skill_registry_manager IN DATABASE :"DBNAME" RESET ALL;
ALTER ROLE ai_agent_skill_registry_runtime IN DATABASE :"DBNAME" RESET ALL;

ALTER ROLE ai_agent_skill_registry_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_migrator_password';
ALTER ROLE ai_agent_skill_registry_manager
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_manager_password';
ALTER ROLE ai_agent_skill_registry_runtime
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'skill_registry_runtime_password';

REVOKE SET ON PARAMETER session_replication_role
  FROM ai_agent_skill_registry_migrator,
       ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS role_setting
    JOIN pg_roles AS role ON role.oid = role_setting.setrole
    WHERE role.rolname IN (
      'ai_agent_skill_registry_migrator',
      'ai_agent_skill_registry_manager',
      'ai_agent_skill_registry_runtime'
    )
    AND cardinality(role_setting.setconfig) > 0
  ) THEN
    RAISE EXCEPTION 'skill registry roles must not retain role settings'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ai_agent_skill_registry_migrator'),
      ('ai_agent_skill_registry_manager'),
      ('ai_agent_skill_registry_runtime')
    ) AS registry_role(role_name)
    WHERE pg_catalog.has_parameter_privilege(
      role_name,
      'session_replication_role',
      'SET'
    )
  ) THEN
    RAISE EXCEPTION 'registry roles must not set session_replication_role'
      USING ERRCODE = '42501';
  END IF;
END
$$;

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
