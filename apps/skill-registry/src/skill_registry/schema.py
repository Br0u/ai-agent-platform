"""Literal schema version one for the isolated reviewed-skill registry."""

SKILL_REGISTRY_SCHEMA_VERSION = 1

REQUIRED_TABLE_NAMES = frozenset(
    {
        "skills",
        "skill_revisions",
        "skill_revision_artifacts",
        "skill_revision_files",
        "skill_control_events",
    }
)

EXPECTED_TABLE_OWNERS = frozenset(
    (table_name, "ai_agent_skill_registry_migrator")
    for table_name in REQUIRED_TABLE_NAMES | {"schema_versions"}
)

EXPECTED_MANAGER_TABLE_GRANTS = frozenset(
    (table_name, privilege, False)
    for table_name in REQUIRED_TABLE_NAMES
    for privilege in ("INSERT", "SELECT")
)

EXPECTED_MANAGER_COLUMN_GRANTS = frozenset(
    {
        ("skills", "archived_at", "UPDATE", False),
        ("skill_revisions", "state", "UPDATE", False),
        ("skill_revisions", "reviewed_by", "UPDATE", False),
        ("skill_revisions", "reviewed_at", "UPDATE", False),
    }
)

EXPECTED_BACKUP_GRANTS = frozenset(
    (table_name, "SELECT", False) for table_name in REQUIRED_TABLE_NAMES | {"schema_versions"}
)

EXPECTED_SCHEMA_GRANTS = frozenset(
    {
        ("ai_agent_backup", "USAGE", False),
        ("ai_agent_skill_registry_manager", "USAGE", False),
        ("ai_agent_skill_registry_migrator", "CREATE", False),
        ("ai_agent_skill_registry_migrator", "USAGE", False),
    }
)

EXPECTED_CONTROL_EVENT_TRANSACTION_COLUMN = frozenset({("transaction_id", "bigint", True, "")})

EXPECTED_REVIEW_STORAGE_COLUMNS = frozenset(
    {
        ("skill_control_events", "content_reviewed", "boolean", False, ""),
        ("skill_control_events", "execution_risk_accepted", "boolean", False, ""),
        (
            "skill_control_events",
            "independent_reviewer_confirmed",
            "boolean",
            False,
            "",
        ),
        (
            "skill_control_events",
            "review_reason",
            "character varying(500)",
            False,
            "",
        ),
        ("skill_control_events", "usage_rights_confirmed", "boolean", False, ""),
        ("skill_revisions", "findings", "jsonb", True, "'[]'::jsonb"),
    }
)

_PG18_REVIEW_EVIDENCE_CONSTRAINT = (
    "CHECK ((event_type::text = ANY (ARRAY['revision_published'::character varying, "
    "'revision_rejected'::character varying]::text[])) AND content_reviewed IS TRUE AND "
    "usage_rights_confirmed IS TRUE AND execution_risk_accepted IS TRUE AND "
    "independent_reviewer_confirmed IS TRUE OR (event_type::text <> ALL "
    "(ARRAY['revision_published'::character varying, 'revision_rejected'::character "
    "varying]::text[])) AND content_reviewed IS NULL AND usage_rights_confirmed IS NULL "
    "AND execution_risk_accepted IS NULL AND independent_reviewer_confirmed IS NULL)"
)
_PG18_REVIEW_REASON_CONSTRAINT = (
    "CHECK (event_type::text = 'revision_rejected'::text AND review_reason IS NOT NULL "
    "AND char_length(btrim(review_reason::text)) >= 1 AND "
    "char_length(btrim(review_reason::text)) <= 500 OR event_type::text <> "
    "'revision_rejected'::text AND review_reason IS NULL)"
)
_PG18_FINDINGS_CONSTRAINT = "CHECK (skill_registry.validate_skill_findings(findings))"
_PG18_REVIEW_FUNCTION = (
    "CREATE OR REPLACE FUNCTION skill_registry.require_revision_review_event() RETURNS "
    "trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'skill_registry' AS "
    "$function$ DECLARE expected_event_type varchar(64); BEGIN IF OLD.state <> "
    "'pending_review' OR NEW.state NOT IN ('published', 'rejected') THEN RETURN NEW; END "
    "IF; expected_event_type := CASE WHEN NEW.state = 'published' THEN "
    "'revision_published' WHEN NEW.state = 'rejected' THEN 'revision_rejected' END; IF "
    "skill_registry.validate_skill_findings(OLD.findings) IS DISTINCT FROM TRUE THEN "
    "RAISE EXCEPTION 'skill findings schema is invalid' USING ERRCODE = '23514'; END IF; "
    "IF NEW.state = 'published' AND EXISTS ( SELECT 1 FROM "
    "pg_catalog.jsonb_array_elements(OLD.findings) AS finding WHERE finding ->> 'code' IN "
    "('unsupported_import', 'private_key') ) THEN RAISE EXCEPTION 'blocking skill "
    "findings prevent publication' USING ERRCODE = '23514'; END IF; IF NOT EXISTS ( "
    "SELECT 1 FROM skill_registry.skill_control_events AS event WHERE event.transaction_id "
    "= pg_catalog.txid_current() AND event.target_id = NEW.id AND event.event_type = "
    "expected_event_type AND event.actor = NEW.reviewed_by::text AND event.result_code = "
    "'ok' ) THEN RAISE EXCEPTION 'skill revision review event is required in the same "
    "transaction' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $function$"
)
_PG18_FINDINGS_FUNCTION = (
    "CREATE OR REPLACE FUNCTION skill_registry.validate_skill_findings(candidate jsonb) "
    "RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path TO "
    "'pg_catalog', 'skill_registry' AS $function$ SELECT CASE WHEN "
    "pg_catalog.jsonb_typeof(candidate) <> 'array' THEN false ELSE NOT EXISTS ( SELECT 1 "
    "FROM pg_catalog.jsonb_array_elements(candidate) AS finding WHERE CASE WHEN "
    "pg_catalog.jsonb_typeof(finding) <> 'object' THEN true ELSE (SELECT "
    "pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(finding)) <> 5 OR NOT (finding "
    "?& ARRAY['path', 'line', 'code', 'message', 'blocking']) OR "
    "pg_catalog.jsonb_typeof(finding -> 'path') <> 'string' OR "
    "pg_catalog.jsonb_typeof(finding -> 'line') <> 'number' OR "
    "pg_catalog.jsonb_typeof(finding -> 'code') <> 'string' OR "
    "pg_catalog.jsonb_typeof(finding -> 'message') <> 'string' OR "
    "pg_catalog.jsonb_typeof(finding -> 'blocking') <> 'boolean' OR finding ->> 'line' !~ "
    "'^[1-9][0-9]*$' OR NOT ( finding ->> 'code' = ANY (ARRAY[ 'possible_secret', "
    "'private_key', 'network_access', 'subprocess', 'environment_read', 'dynamic_code', "
    "'filesystem_write', 'unsupported_import', 'external_url' ]) ) END ) END $function$"
)

EXPECTED_REVIEW_CONSTRAINTS = frozenset(
    {
        (
            "skill_control_events_review_evidence",
            "skill_control_events",
            "c",
            True,
            _PG18_REVIEW_EVIDENCE_CONSTRAINT,
        ),
        (
            "skill_control_events_review_reason",
            "skill_control_events",
            "c",
            True,
            _PG18_REVIEW_REASON_CONSTRAINT,
        ),
        (
            "skill_revisions_findings_array",
            "skill_revisions",
            "c",
            True,
            _PG18_FINDINGS_CONSTRAINT,
        ),
    }
)

EXPECTED_REVIEW_TRIGGER_GUARDS = frozenset(
    {
        ("require_revision_review_event", _PG18_REVIEW_FUNCTION),
        ("validate_skill_findings", _PG18_FINDINGS_FUNCTION),
    }
)

EXPECTED_FUNCTION_BOUNDARY = frozenset(
    (
        function_name,
        "ai_agent_skill_registry_migrator",
        0,
        "trigger",
        "plpgsql",
        False,
        "search_path=pg_catalog, skill_registry",
        True,
        False,
    )
    for function_name in {
        "deny_append_only_mutation",
        "guard_revision_insert",
        "guard_revision_update",
        "guard_skill_update",
        "require_revision_review_event",
        "stamp_control_event_transaction",
    }
) | {
    (
        "validate_skill_findings",
        "ai_agent_skill_registry_migrator",
        1,
        "boolean",
        "sql",
        False,
        "search_path=pg_catalog, skill_registry",
        True,
        True,
    )
}

EXPECTED_SECURITY_TRIGGERS = frozenset(
    {
        (
            "skill_control_events_append_only",
            "skill_control_events",
            "deny_append_only_mutation",
            27,
            False,
            False,
            "A",
        ),
        (
            "skill_control_events_stamp_transaction",
            "skill_control_events",
            "stamp_control_event_transaction",
            7,
            False,
            False,
            "A",
        ),
        (
            "skill_revision_artifacts_append_only",
            "skill_revision_artifacts",
            "deny_append_only_mutation",
            27,
            False,
            False,
            "A",
        ),
        (
            "skill_revision_files_append_only",
            "skill_revision_files",
            "deny_append_only_mutation",
            27,
            False,
            False,
            "A",
        ),
        (
            "skill_revisions_guard_insert",
            "skill_revisions",
            "guard_revision_insert",
            7,
            False,
            False,
            "A",
        ),
        (
            "skill_revisions_guard_update",
            "skill_revisions",
            "guard_revision_update",
            19,
            False,
            False,
            "A",
        ),
        (
            "skill_revisions_require_review_event",
            "skill_revisions",
            "require_revision_review_event",
            17,
            True,
            True,
            "A",
        ),
        (
            "skills_guard_update",
            "skills",
            "guard_skill_update",
            19,
            False,
            False,
            "A",
        ),
    }
)

VERIFY_SCHEMA_OWNER_SQL = """SELECT pg_get_userbyid(n.nspowner)::text
FROM pg_namespace AS n
WHERE n.nspname = 'skill_registry'
"""

PREPARE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS skill_registry.schema_versions (
  version smallint PRIMARY KEY CHECK (version >= 1),
  applied_at timestamptz NOT NULL DEFAULT now()
);
"""

SELECT_SCHEMA_VERSION_SQL = """
SELECT MAX(version), COUNT(*)
FROM skill_registry.schema_versions
"""

LOCK_SCHEMA_VERSION_SQL = """
LOCK TABLE skill_registry.schema_versions IN EXCLUSIVE MODE
"""

SCHEMA_VERSION_1_SQL = """
CREATE OR REPLACE FUNCTION skill_registry.validate_skill_findings(candidate jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, skill_registry
AS $$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(candidate) <> 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(candidate) AS finding
      WHERE CASE
        WHEN pg_catalog.jsonb_typeof(finding) <> 'object' THEN true
        ELSE
          (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(finding)) <> 5
          OR NOT (finding ?& ARRAY['path', 'line', 'code', 'message', 'blocking'])
          OR pg_catalog.jsonb_typeof(finding -> 'path') <> 'string'
          OR pg_catalog.jsonb_typeof(finding -> 'line') <> 'number'
          OR pg_catalog.jsonb_typeof(finding -> 'code') <> 'string'
          OR pg_catalog.jsonb_typeof(finding -> 'message') <> 'string'
          OR pg_catalog.jsonb_typeof(finding -> 'blocking') <> 'boolean'
          OR finding ->> 'line' !~ '^[1-9][0-9]*$'
          OR NOT (
            finding ->> 'code' = ANY (ARRAY[
              'possible_secret',
              'private_key',
              'network_access',
              'subprocess',
              'environment_read',
              'dynamic_code',
              'filesystem_write',
              'unsupported_import',
              'external_url'
            ])
          )
      END
    )
  END
$$;

CREATE TABLE skill_registry.skills (
  id uuid PRIMARY KEY,
  slug varchar(128) NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE skill_registry.skill_revisions (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skill_registry.skills(id) ON DELETE RESTRICT,
  revision_no bigint NOT NULL CHECK (revision_no >= 1),
  state varchar(24) NOT NULL
    CHECK (state IN ('pending_review','published','rejected','archived')),
  source_type varchar(16) NOT NULL
    CHECK (source_type IN ('upload','github','gitlab','gitcode')),
  source_url text,
  source_ref varchar(255),
  source_commit varchar(128),
  manifest jsonb NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  UNIQUE (skill_id, revision_no),
  UNIQUE (id, skill_id),
  CHECK (
    (state = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (state <> 'pending_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (
    (source_type = 'upload' AND source_url IS NULL)
    OR (source_type <> 'upload' AND source_url IS NOT NULL)
  ),
  CONSTRAINT skill_revisions_findings_array
    CHECK (skill_registry.validate_skill_findings(findings))
);

CREATE TABLE skill_registry.skill_revision_artifacts (
  revision_id uuid PRIMARY KEY,
  skill_id uuid NOT NULL,
  artifact_sha256 char(64) NOT NULL
    CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  compressed_size integer NOT NULL
    CHECK (compressed_size BETWEEN 1 AND 5242880),
  extracted_size integer NOT NULL
    CHECK (extracted_size BETWEEN 1 AND 20971520),
  file_count smallint NOT NULL
    CHECK (file_count BETWEEN 1 AND 128),
  archive_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (revision_id, skill_id)
    REFERENCES skill_registry.skill_revisions(id, skill_id) ON DELETE RESTRICT,
  UNIQUE (skill_id, artifact_sha256),
  CHECK (octet_length(archive_bytes) = compressed_size)
);

CREATE TABLE skill_registry.skill_revision_files (
  revision_id uuid NOT NULL
    REFERENCES skill_registry.skill_revisions(id) ON DELETE RESTRICT,
  path varchar(512) NOT NULL,
  file_sha256 char(64) NOT NULL
    CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  size integer NOT NULL CHECK (size BETWEEN 0 AND 2097152),
  media_type varchar(255),
  PRIMARY KEY (revision_id, path),
  CHECK (path <> '' AND path !~ '(^|/)\\.\\.?(/|$)')
);

CREATE TABLE skill_registry.skill_control_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  assertion_nonce uuid UNIQUE,
  transaction_id bigint NOT NULL,
  actor varchar(255) NOT NULL,
  event_type varchar(64) NOT NULL
    CHECK (event_type IN (
      'skill_created',
      'revision_created',
      'revision_published',
      'revision_rejected',
      'skill_archived',
      'skill_read',
      'revision_read'
    )),
  target_id uuid NOT NULL,
  result_code varchar(32) NOT NULL
    CHECK (result_code IN ('ok','replay','error')),
  error_code varchar(64)
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'),
  review_reason varchar(500),
  content_reviewed boolean,
  usage_rights_confirmed boolean,
  execution_risk_accepted boolean,
  independent_reviewer_confirmed boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('skill_read','revision_read') OR assertion_nonce IS NOT NULL),
  CHECK (
    (result_code = 'error' AND error_code IS NOT NULL)
    OR (result_code <> 'error' AND error_code IS NULL)
  ),
  CONSTRAINT skill_control_events_review_reason CHECK (
    (
      event_type = 'revision_rejected'
      AND review_reason IS NOT NULL
      AND char_length(btrim(review_reason)) BETWEEN 1 AND 500
    )
    OR (event_type <> 'revision_rejected' AND review_reason IS NULL)
  ),
  CONSTRAINT skill_control_events_review_evidence CHECK (
    (
      event_type IN ('revision_published', 'revision_rejected')
      AND content_reviewed IS TRUE
      AND usage_rights_confirmed IS TRUE
      AND execution_risk_accepted IS TRUE
      AND independent_reviewer_confirmed IS TRUE
    )
    OR (
      event_type NOT IN ('revision_published', 'revision_rejected')
      AND content_reviewed IS NULL
      AND usage_rights_confirmed IS NULL
      AND execution_risk_accepted IS NULL
      AND independent_reviewer_confirmed IS NULL
    )
  )
);

ALTER TABLE skill_registry.skills OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.skill_revisions OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.skill_revision_artifacts
  OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.skill_revision_files
  OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.skill_control_events
  OWNER TO ai_agent_skill_registry_migrator;

CREATE OR REPLACE FUNCTION skill_registry.guard_skill_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'skill identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'skill may be archived only once'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.guard_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.skill_id IS DISTINCT FROM OLD.skill_id
    OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_url IS DISTINCT FROM OLD.source_url
    OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
    OR NEW.source_commit IS DISTINCT FROM OLD.source_commit
    OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.findings IS DISTINCT FROM OLD.findings
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'skill revision body is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.state = 'pending_review' AND NEW.state IN ('published', 'rejected') THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'review actor and timestamp are required'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.reviewed_by = OLD.created_by THEN
      RAISE EXCEPTION 'skill revision review requires a second actor'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state = 'published' AND NEW.state = 'archived' THEN
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'review metadata is immutable after review'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid skill revision state transition'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.guard_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.state <> 'pending_review'
    OR NEW.reviewed_by IS NOT NULL
    OR NEW.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'new skill revisions must start pending review'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.stamp_control_event_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  NEW.transaction_id := pg_catalog.txid_current();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.require_revision_review_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  expected_event_type varchar(64);
BEGIN
  IF OLD.state <> 'pending_review'
    OR NEW.state NOT IN ('published', 'rejected') THEN
    RETURN NEW;
  END IF;

  expected_event_type := CASE
    WHEN NEW.state = 'published' THEN 'revision_published'
    WHEN NEW.state = 'rejected' THEN 'revision_rejected'
  END;

  IF skill_registry.validate_skill_findings(OLD.findings) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'skill findings schema is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state = 'published' AND EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(OLD.findings) AS finding
    WHERE finding ->> 'code' IN ('unsupported_import', 'private_key')
  ) THEN
    RAISE EXCEPTION 'blocking skill findings prevent publication'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM skill_registry.skill_control_events AS event
    WHERE event.transaction_id = pg_catalog.txid_current()
      AND event.target_id = NEW.id
      AND event.event_type = expected_event_type
      AND event.actor = NEW.reviewed_by::text
      AND event.result_code = 'ok'
  ) THEN
    RAISE EXCEPTION 'skill revision review event is required in the same transaction'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.deny_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION skill_registry.guard_skill_update()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.guard_revision_update()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.guard_revision_insert()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.stamp_control_event_transaction()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.require_revision_review_event()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.deny_append_only_mutation()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.validate_skill_findings(jsonb)
  OWNER TO ai_agent_skill_registry_migrator;
REVOKE ALL ON FUNCTION skill_registry.guard_skill_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.guard_revision_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.guard_revision_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.stamp_control_event_transaction() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.require_revision_review_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.deny_append_only_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.validate_skill_findings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION skill_registry.validate_skill_findings(jsonb)
  TO ai_agent_skill_registry_manager;

CREATE TRIGGER skills_guard_update
BEFORE UPDATE ON skill_registry.skills
FOR EACH ROW EXECUTE FUNCTION skill_registry.guard_skill_update();
ALTER TABLE skill_registry.skills
  ENABLE ALWAYS TRIGGER skills_guard_update;

CREATE TRIGGER skill_revisions_guard_update
BEFORE UPDATE ON skill_registry.skill_revisions
FOR EACH ROW EXECUTE FUNCTION skill_registry.guard_revision_update();
ALTER TABLE skill_registry.skill_revisions
  ENABLE ALWAYS TRIGGER skill_revisions_guard_update;

CREATE TRIGGER skill_revisions_guard_insert
BEFORE INSERT ON skill_registry.skill_revisions
FOR EACH ROW EXECUTE FUNCTION skill_registry.guard_revision_insert();
ALTER TABLE skill_registry.skill_revisions
  ENABLE ALWAYS TRIGGER skill_revisions_guard_insert;

CREATE CONSTRAINT TRIGGER skill_revisions_require_review_event
AFTER UPDATE ON skill_registry.skill_revisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION skill_registry.require_revision_review_event();
ALTER TABLE skill_registry.skill_revisions
  ENABLE ALWAYS TRIGGER skill_revisions_require_review_event;

CREATE TRIGGER skill_control_events_stamp_transaction
BEFORE INSERT ON skill_registry.skill_control_events
FOR EACH ROW EXECUTE FUNCTION skill_registry.stamp_control_event_transaction();
ALTER TABLE skill_registry.skill_control_events
  ENABLE ALWAYS TRIGGER skill_control_events_stamp_transaction;

CREATE TRIGGER skill_revision_artifacts_append_only
BEFORE UPDATE OR DELETE ON skill_registry.skill_revision_artifacts
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.skill_revision_artifacts
  ENABLE ALWAYS TRIGGER skill_revision_artifacts_append_only;

CREATE TRIGGER skill_revision_files_append_only
BEFORE UPDATE OR DELETE ON skill_registry.skill_revision_files
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.skill_revision_files
  ENABLE ALWAYS TRIGGER skill_revision_files_append_only;

CREATE TRIGGER skill_control_events_append_only
BEFORE UPDATE OR DELETE ON skill_registry.skill_control_events
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.skill_control_events
  ENABLE ALWAYS TRIGGER skill_control_events_append_only;

REVOKE ALL ON SCHEMA skill_registry FROM PUBLIC;
REVOKE ALL ON SCHEMA skill_registry
  FROM ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime,
       ai_agent_backup,
       ai_agent_migrator,
       ai_agent_runtime,
       ai_agent_agno_migrator,
       ai_agent_agno,
       ai_agent_control_migrator,
       ai_agent_control;
REVOKE ALL ON ALL TABLES IN SCHEMA skill_registry FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA skill_registry
  FROM ai_agent_skill_registry_manager,
       ai_agent_skill_registry_runtime,
       ai_agent_backup,
       ai_agent_migrator,
       ai_agent_runtime,
       ai_agent_agno_migrator,
       ai_agent_agno,
       ai_agent_control_migrator,
       ai_agent_control;

GRANT USAGE ON SCHEMA skill_registry TO ai_agent_skill_registry_manager;
GRANT SELECT ON
  skill_registry.skills,
  skill_registry.skill_revisions,
  skill_registry.skill_revision_artifacts,
  skill_registry.skill_revision_files,
  skill_registry.skill_control_events
TO ai_agent_skill_registry_manager;
GRANT INSERT ON
  skill_registry.skills,
  skill_registry.skill_revisions,
  skill_registry.skill_revision_artifacts,
  skill_registry.skill_revision_files,
  skill_registry.skill_control_events
TO ai_agent_skill_registry_manager;
GRANT UPDATE (archived_at) ON skill_registry.skills
  TO ai_agent_skill_registry_manager;
GRANT UPDATE (state, reviewed_by, reviewed_at)
  ON skill_registry.skill_revisions
  TO ai_agent_skill_registry_manager;

GRANT USAGE ON SCHEMA skill_registry TO ai_agent_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA skill_registry TO ai_agent_backup;

INSERT INTO skill_registry.schema_versions (version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;
"""

VERIFY_TABLES_SQL = """SELECT
  c.relname::text,
  pg_get_userbyid(c.relowner)::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'skill_registry'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname
"""

VERIFY_MANAGER_TABLE_GRANTS_SQL = """SELECT
  table_name::text,
  privilege_type::text,
  is_grantable = 'YES'
FROM information_schema.role_table_grants
WHERE table_schema = 'skill_registry'
  AND grantee = 'ai_agent_skill_registry_manager'
ORDER BY table_name, privilege_type
"""

VERIFY_MANAGER_COLUMN_GRANTS_SQL = """SELECT
  table_name::text,
  column_name::text,
  privilege_type::text,
  is_grantable = 'YES'
FROM information_schema.role_column_grants
WHERE table_schema = 'skill_registry'
  AND grantee = 'ai_agent_skill_registry_manager'
  AND privilege_type = 'UPDATE'
ORDER BY table_name, column_name
"""

VERIFY_BACKUP_GRANTS_SQL = """SELECT
  table_name::text,
  privilege_type::text,
  is_grantable = 'YES'
FROM information_schema.role_table_grants
WHERE table_schema = 'skill_registry'
  AND grantee = 'ai_agent_backup'
ORDER BY table_name, privilege_type
"""

VERIFY_FORBIDDEN_GRANTS_SQL = """SELECT
  c.relname::text,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee)::text END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE n.nspname = 'skill_registry'
  AND c.relkind IN ('r', 'p')
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee)::text IN (
      'ai_agent_skill_registry_runtime',
      'ai_agent_migrator',
      'ai_agent_runtime',
      'ai_agent_agno_migrator',
      'ai_agent_agno',
      'ai_agent_control_migrator',
      'ai_agent_control'
    )
  )
ORDER BY c.relname, 2, acl.privilege_type
"""

VERIFY_SCHEMA_GRANTS_SQL = """SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee)::text END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_namespace AS n
CROSS JOIN LATERAL aclexplode(
  COALESCE(n.nspacl, acldefault('n', n.nspowner))
) AS acl
WHERE n.nspname = 'skill_registry'
ORDER BY 1, acl.privilege_type
"""

VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL = """SELECT
  a.attname::text,
  format_type(a.atttypid, a.atttypmod)::text,
  a.attnotnull,
  COALESCE(pg_get_expr(d.adbin, d.adrelid), '')::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'skill_registry'
  AND c.relname = 'skill_control_events'
  AND a.attname = 'transaction_id'
  AND NOT a.attisdropped
"""

VERIFY_REVIEW_STORAGE_COLUMNS_SQL = """SELECT
  c.relname::text,
  a.attname::text,
  format_type(a.atttypid, a.atttypmod)::text,
  a.attnotnull,
  COALESCE(pg_get_expr(d.adbin, d.adrelid), '')::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'skill_registry'
  AND (
    (c.relname = 'skill_revisions' AND a.attname = 'findings')
    OR (
      c.relname = 'skill_control_events'
      AND a.attname IN (
        'review_reason',
        'content_reviewed',
        'usage_rights_confirmed',
        'execution_risk_accepted',
        'independent_reviewer_confirmed'
      )
    )
  )
  AND NOT a.attisdropped
ORDER BY c.relname, a.attname
"""

VERIFY_REVIEW_CONSTRAINTS_SQL = """SELECT
  constraint_row.conname::text,
  relation.relname::text,
  constraint_row.contype::text,
  constraint_row.convalidated,
  btrim(regexp_replace(
    pg_get_constraintdef(constraint_row.oid, true),
    '[[:space:]]+', ' ', 'g'
  ))::text
FROM pg_constraint AS constraint_row
JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
JOIN pg_namespace AS relation_schema ON relation_schema.oid = relation.relnamespace
WHERE relation_schema.nspname = 'skill_registry'
  AND constraint_row.conname IN (
    'skill_revisions_findings_array',
    'skill_control_events_review_reason',
    'skill_control_events_review_evidence'
  )
ORDER BY constraint_row.conname
"""

VERIFY_REVIEW_TRIGGER_GUARDS_SQL = """SELECT
  function.proname::text,
  btrim(regexp_replace(
    pg_get_functiondef(function.oid),
    '[[:space:]]+', ' ', 'g'
  ))::text
FROM pg_proc AS function
JOIN pg_namespace AS function_schema ON function_schema.oid = function.pronamespace
WHERE function_schema.nspname = 'skill_registry'
  AND function.proname IN (
    'require_revision_review_event',
    'validate_skill_findings'
  )
ORDER BY function.proname
"""

VERIFY_FUNCTION_BOUNDARY_SQL = """SELECT
  p.proname::text,
  pg_get_userbyid(p.proowner)::text,
  p.pronargs::integer,
  p.prorettype::regtype::text,
  l.lanname::text,
  p.prosecdef,
  COALESCE(array_to_string(p.proconfig, ','), '')::text,
  NOT EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
    WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  pg_catalog.has_function_privilege(
    'ai_agent_skill_registry_manager', p.oid, 'EXECUTE'
  )
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'skill_registry'
ORDER BY p.proname
"""

VERIFY_SECURITY_TRIGGERS_SQL = """SELECT
  trigger.tgname::text,
  relation.relname::text,
  function.proname::text,
  trigger.tgtype::integer,
  trigger.tgdeferrable,
  trigger.tginitdeferred,
  trigger.tgenabled::text
FROM pg_trigger AS trigger
JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
JOIN pg_namespace AS relation_schema ON relation_schema.oid = relation.relnamespace
JOIN pg_proc AS function ON function.oid = trigger.tgfoid
WHERE relation_schema.nspname = 'skill_registry'
  AND NOT trigger.tgisinternal
ORDER BY trigger.tgname
"""

VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL = """SELECT
  granted_role.rolname::text,
  member_role.rolname::text
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
ORDER BY granted_role.rolname, member_role.rolname
"""

VERIFY_REGISTRY_ROLE_SETTINGS_SQL = """SELECT
  role.rolname::text,
  role_setting.setdatabase::oid::bigint,
  array_to_string(role_setting.setconfig, ',')::text
FROM pg_db_role_setting AS role_setting
JOIN pg_roles AS role ON role.oid = role_setting.setrole
WHERE role.rolname IN (
  'ai_agent_skill_registry_migrator',
  'ai_agent_skill_registry_manager',
  'ai_agent_skill_registry_runtime'
)
  AND cardinality(role_setting.setconfig) > 0
ORDER BY role.rolname, role_setting.setdatabase
"""

VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL = """SELECT role_name::text
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
ORDER BY role_name
"""
