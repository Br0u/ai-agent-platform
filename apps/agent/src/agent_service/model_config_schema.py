"""Literal versioned SQL for the isolated Agent model control schema."""


AGENT_CONTROL_SCHEMA_VERSION = 1

REQUIRED_TABLE_NAMES = frozenset(
    {"model_configs", "active_model_config", "control_events"}
)

EXPECTED_RUNTIME_GRANTS = frozenset(
    {
        ("active_model_config", "INSERT"),
        ("active_model_config", "SELECT"),
        ("active_model_config", "UPDATE"),
        ("control_events", "INSERT"),
        ("control_events", "SELECT"),
        ("model_configs", "INSERT"),
        ("model_configs", "SELECT"),
        ("model_configs", "UPDATE"),
    }
)

PREPARE_SCHEMA_SQL = """
ALTER SCHEMA agent_control OWNER TO ai_agent_control_migrator;
REVOKE ALL ON SCHEMA agent_control FROM PUBLIC;
REVOKE ALL ON SCHEMA agent_control
  FROM ai_agent_migrator, ai_agent_runtime, ai_agent_backup,
       ai_agent_agno_migrator, ai_agent_agno;

CREATE TABLE IF NOT EXISTS agent_control.schema_versions (
  version smallint PRIMARY KEY CHECK (version >= 1),
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_control.schema_versions OWNER TO ai_agent_control_migrator;
REVOKE ALL ON TABLE agent_control.schema_versions FROM PUBLIC;
REVOKE ALL ON TABLE agent_control.schema_versions FROM ai_agent_control;
"""

SELECT_SCHEMA_VERSION_SQL = """
SELECT version
FROM agent_control.schema_versions
WHERE version = 1
"""

SCHEMA_VERSION_1_SQL = """
CREATE TABLE agent_control.model_configs (
  id uuid PRIMARY KEY,
  provider varchar(16) NOT NULL
    CHECK (provider IN ('openai','anthropic','google','dashscope','deepseek','minimax')),
  model_id varchar(128) NOT NULL,
  endpoint_id varchar(64) NOT NULL,
  api_key_ciphertext bytea NOT NULL,
  api_key_nonce bytea NOT NULL CHECK (octet_length(api_key_nonce) = 12),
  api_key_last_four varchar(4) NOT NULL CHECK (char_length(api_key_last_four) = 4),
  encryption_key_version smallint NOT NULL CHECK (encryption_key_version = 1),
  revision bigint NOT NULL CHECK (revision >= 1),
  is_current boolean NOT NULL,
  test_status varchar(16) NOT NULL CHECK (test_status IN ('untested','passed','failed')),
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, revision)
);
CREATE UNIQUE INDEX model_configs_one_current_per_provider
  ON agent_control.model_configs(provider) WHERE is_current;

CREATE TABLE agent_control.active_model_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  model_config_id uuid NOT NULL REFERENCES agent_control.model_configs(id) ON DELETE RESTRICT,
  config_revision bigint NOT NULL CHECK (config_revision >= 1),
  activation_version bigint NOT NULL CHECK (activation_version >= 1),
  activated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_control.control_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  assertion_nonce uuid NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL,
  action varchar(48) NOT NULL,
  provider varchar(16) NOT NULL,
  model_id varchar(128) NOT NULL,
  endpoint_id varchar(64) NOT NULL,
  config_revision bigint NOT NULL CHECK (config_revision >= 0),
  result varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_control.model_configs OWNER TO ai_agent_control_migrator;
ALTER TABLE agent_control.active_model_config OWNER TO ai_agent_control_migrator;
ALTER TABLE agent_control.control_events OWNER TO ai_agent_control_migrator;

CREATE OR REPLACE FUNCTION agent_control.guard_model_config_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.model_id IS DISTINCT FROM OLD.model_id
    OR NEW.endpoint_id IS DISTINCT FROM OLD.endpoint_id
    OR NEW.api_key_ciphertext IS DISTINCT FROM OLD.api_key_ciphertext
    OR NEW.api_key_nonce IS DISTINCT FROM OLD.api_key_nonce
    OR NEW.api_key_last_four IS DISTINCT FROM OLD.api_key_last_four
    OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'model config revision fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.is_current = false AND NEW.is_current = true THEN
    RAISE EXCEPTION 'retired model config revisions cannot become current'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;
ALTER FUNCTION agent_control.guard_model_config_update()
  OWNER TO ai_agent_control_migrator;
REVOKE ALL ON FUNCTION agent_control.guard_model_config_update() FROM PUBLIC;

CREATE TRIGGER model_configs_guard_update
BEFORE UPDATE ON agent_control.model_configs
FOR EACH ROW
EXECUTE FUNCTION agent_control.guard_model_config_update();

REVOKE ALL ON SCHEMA agent_control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA agent_control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA agent_control
  FROM ai_agent_migrator, ai_agent_runtime, ai_agent_backup,
       ai_agent_agno_migrator, ai_agent_agno;
REVOKE ALL ON TABLE agent_control.model_configs FROM ai_agent_control;
REVOKE ALL ON TABLE agent_control.active_model_config FROM ai_agent_control;
REVOKE ALL ON TABLE agent_control.control_events FROM ai_agent_control;

GRANT USAGE ON SCHEMA agent_control TO ai_agent_control;
GRANT SELECT, INSERT, UPDATE ON agent_control.model_configs TO ai_agent_control;
GRANT SELECT, INSERT, UPDATE ON agent_control.active_model_config TO ai_agent_control;
GRANT SELECT, INSERT ON agent_control.control_events TO ai_agent_control;

INSERT INTO agent_control.schema_versions (version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;
"""

VERIFY_TABLES_SQL = """
SELECT table_name::text
FROM information_schema.tables
WHERE table_schema = 'agent_control'
  AND table_name IN ('model_configs', 'active_model_config', 'control_events')
ORDER BY table_name
"""

VERIFY_RUNTIME_GRANTS_SQL = """
SELECT table_name::text, privilege_type::text
FROM information_schema.role_table_grants
WHERE table_schema = 'agent_control'
  AND grantee = 'ai_agent_control'
ORDER BY table_name, privilege_type
"""

VERIFY_SCHEMA_PRIVILEGES_SQL = """
SELECT
  has_schema_privilege('ai_agent_control', 'agent_control', 'USAGE'),
  has_schema_privilege('ai_agent_control', 'agent_control', 'CREATE')
"""
