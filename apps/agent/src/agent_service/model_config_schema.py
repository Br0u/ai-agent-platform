"""Literal versioned SQL for the isolated Agent model control schema."""

AGENT_CONTROL_SCHEMA_VERSION = 1

REQUIRED_TABLE_NAMES = frozenset(
    {"model_configs", "active_model_config", "control_events"}
)

EXPECTED_RUNTIME_GRANTS = frozenset(
    {
        ("active_model_config", "INSERT", False),
        ("active_model_config", "SELECT", False),
        ("active_model_config", "UPDATE", False),
        ("control_events", "INSERT", False),
        ("control_events", "SELECT", False),
        ("model_configs", "INSERT", False),
        ("model_configs", "SELECT", False),
        ("model_configs", "UPDATE", False),
    }
)

EXPECTED_TABLE_OWNERS = frozenset(
    {
        ("active_model_config", "ai_agent_control_migrator"),
        ("control_events", "ai_agent_control_migrator"),
        ("model_configs", "ai_agent_control_migrator"),
        ("schema_versions", "ai_agent_control_migrator"),
    }
)

EXPECTED_FUNCTION_BOUNDARY = frozenset(
    {
        (
            "guard_model_config_update",
            0,
            "ai_agent_control_migrator",
            "trigger",
            "plpgsql",
            "f",
            False,
            False,
            True,
            "BEGIN IF NEW.id IS DISTINCT FROM OLD.id "
            "OR NEW.provider IS DISTINCT FROM OLD.provider "
            "OR NEW.model_id IS DISTINCT FROM OLD.model_id "
            "OR NEW.endpoint_id IS DISTINCT FROM OLD.endpoint_id "
            "OR NEW.api_key_ciphertext IS DISTINCT FROM OLD.api_key_ciphertext "
            "OR NEW.api_key_nonce IS DISTINCT FROM OLD.api_key_nonce "
            "OR NEW.api_key_last_four IS DISTINCT FROM OLD.api_key_last_four "
            "OR NEW.encryption_key_version IS DISTINCT FROM "
            "OLD.encryption_key_version "
            "OR NEW.revision IS DISTINCT FROM OLD.revision "
            "OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN "
            "RAISE EXCEPTION 'model config revision fields are immutable' "
            "USING ERRCODE = '42501'; END IF; "
            "IF OLD.is_current = false AND NEW.is_current = true THEN "
            "RAISE EXCEPTION 'retired model config revisions cannot become current' "
            "USING ERRCODE = '42501'; END IF; RETURN NEW; END;",
        )
    }
)

EXPECTED_TRIGGER_BOUNDARY = frozenset(
    {
        (
            "model_configs_guard_update",
            "model_configs",
            "agent_control",
            "guard_model_config_update",
            "ai_agent_control_migrator",
            "ai_agent_control_migrator",
            "O",
            19,
            0,
            "",
            True,
        )
    }
)

EXPECTED_SCHEMA_GRANTS = frozenset(
    {
        ("ai_agent_control", "USAGE", False),
        ("ai_agent_control_migrator", "CREATE", False),
        ("ai_agent_control_migrator", "USAGE", False),
    }
)

EXPECTED_SCHEMA_VERSION_COLUMNS = (
    ("version", "smallint", True, ""),
    ("applied_at", "timestamp with time zone", True, "now()"),
)

EXPECTED_SCHEMA_VERSION_CONSTRAINTS = (
    ("c", "CHECK (version >= 1)", False, False, True),
    ("p", "PRIMARY KEY (version)", False, False, True),
)

VERIFY_SCHEMA_OWNER_SQL = """SELECT pg_get_userbyid(n.nspowner)::text
FROM pg_namespace AS n
WHERE n.nspname = 'agent_control'
"""

PREPARE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS agent_control.schema_versions (
  version smallint PRIMARY KEY CHECK (version >= 1),
  applied_at timestamptz NOT NULL DEFAULT now()
);
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
END;
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

VERIFY_TABLES_SQL = """SELECT
  c.relname::text,
  pg_get_userbyid(c.relowner)::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'agent_control'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname
"""

VERIFY_FUNCTION_BOUNDARY_SQL = """SELECT
  p.proname::text,
  p.pronargs::integer,
  pg_get_userbyid(p.proowner)::text,
  p.prorettype::regtype::text,
  l.lanname::text,
  p.prokind::text,
  p.prosecdef,
  p.proretset,
  p.proconfig IS NULL,
  btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'agent_control'
ORDER BY p.proname, p.pronargs
"""

VERIFY_TRIGGER_BOUNDARY_SQL = """SELECT
  t.tgname::text,
  table_class.relname::text,
  function_schema.nspname::text,
  trigger_function.proname::text,
  pg_get_userbyid(table_class.relowner)::text,
  pg_get_userbyid(trigger_function.proowner)::text,
  t.tgenabled::text,
  t.tgtype::integer,
  t.tgnargs::integer,
  t.tgattr::text,
  t.tgqual IS NULL
FROM pg_trigger AS t
JOIN pg_class AS table_class ON table_class.oid = t.tgrelid
JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
JOIN pg_proc AS trigger_function ON trigger_function.oid = t.tgfoid
JOIN pg_namespace AS function_schema
  ON function_schema.oid = trigger_function.pronamespace
WHERE table_schema.nspname = 'agent_control'
  AND NOT t.tgisinternal
ORDER BY t.tgname
"""

VERIFY_RUNTIME_GRANTS_SQL = """SELECT
  c.relname::text,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE n.nspname = 'agent_control'
  AND c.relkind IN ('r', 'p')
  AND acl.grantee = (
    SELECT oid FROM pg_roles WHERE rolname = 'ai_agent_control'
  )
ORDER BY c.relname, acl.privilege_type
"""

VERIFY_FORBIDDEN_TABLE_GRANTS_SQL = """SELECT
  c.relname::text,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(acl.grantee)::text
  END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE n.nspname = 'agent_control'
  AND c.relkind IN ('r', 'p')
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee)::text IN (
      'ai_agent_migrator',
      'ai_agent_runtime',
      'ai_agent_backup',
      'ai_agent_agno_migrator',
      'ai_agent_agno'
    )
  )
ORDER BY c.relname, 2, acl.privilege_type
"""

VERIFY_COLUMN_GRANTS_SQL = """SELECT
  c.relname::text,
  a.attname::text,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(acl.grantee)::text
  END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
WHERE n.nspname = 'agent_control'
  AND c.relkind IN ('r', 'p')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum, 3, acl.privilege_type
"""

VERIFY_PUBLIC_FUNCTION_GRANTS_SQL = """SELECT
  p.proname::text,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl, acldefault('f', p.proowner))
) AS acl
WHERE n.nspname = 'agent_control'
  AND acl.grantee = 0
ORDER BY p.proname, acl.privilege_type
"""

VERIFY_SCHEMA_PRIVILEGES_SQL = """SELECT
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(acl.grantee)::text
  END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_namespace AS n
CROSS JOIN LATERAL aclexplode(
  COALESCE(n.nspacl, acldefault('n', n.nspowner))
) AS acl
WHERE n.nspname = 'agent_control'
ORDER BY 1, acl.privilege_type
"""

VERIFY_SCHEMA_VERSION_COLUMNS_SQL = """SELECT
  a.attname::text,
  format_type(a.atttypid, a.atttypmod)::text,
  a.attnotnull,
  COALESCE(pg_get_expr(d.adbin, d.adrelid), '')::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'agent_control'
  AND c.relname = 'schema_versions'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum
"""

VERIFY_SCHEMA_VERSION_CONSTRAINTS_SQL = """SELECT
  con.contype::text,
  pg_get_constraintdef(con.oid, true)::text,
  con.condeferrable,
  con.condeferred,
  con.convalidated
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'agent_control'
  AND c.relname = 'schema_versions'
  AND con.contype IN ('c', 'p')
ORDER BY con.contype, pg_get_constraintdef(con.oid, true)
"""
