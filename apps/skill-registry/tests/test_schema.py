from pathlib import Path
import re
import subprocess

from skill_registry.schema import (
    PREPARE_SCHEMA_SQL,
    REQUIRED_TABLE_NAMES,
    SCHEMA_VERSION_1_SQL,
    SCHEMA_VERSION_2_SQL,
    SKILL_REGISTRY_SCHEMA_VERSION,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
ROLE_FLAGS = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
ROLE_NAMES = (
    "ai_agent_skill_registry_migrator",
    "ai_agent_skill_registry_manager",
    "ai_agent_skill_registry_runtime",
)


def normalize_sql(value: str) -> str:
    return " ".join(value.split())


def test_role_bootstrap_creates_and_rotates_only_the_three_registry_roles() -> None:
    role_sql = (REPO_ROOT / "infra/postgres/05-skill-registry-roles.sql").read_text()
    normalized = normalize_sql(role_sql)

    for role_name in ROLE_NAMES:
        assert f"CREATE ROLE {role_name} {ROLE_FLAGS};" in normalized
        assert f"ALTER ROLE {role_name} {ROLE_FLAGS} PASSWORD" in normalized
    assert len(re.findall(r"CREATE ROLE ai_agent_skill_registry_", role_sql)) == 3
    assert "skill_registry_migrator_password" in role_sql
    assert "skill_registry_manager_password" in role_sql
    assert "skill_registry_runtime_password" in role_sql
    assert "CREATE SCHEMA IF NOT EXISTS skill_registry" in normalized
    assert "AUTHORIZATION ai_agent_skill_registry_migrator" in normalized


def test_role_bootstrap_wrapper_rejects_missing_passwords_and_is_transactional() -> None:
    wrapper = (REPO_ROOT / "infra/postgres/05-skill-registry-roles.sh").read_text()

    for environment_name in (
        "SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD",
        "SKILL_REGISTRY_DATABASE_PASSWORD",
        "SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD",
    ):
        assert f"require_nonblank {environment_name}" in wrapper
    assert "--single-transaction" in wrapper
    assert "-v ON_ERROR_STOP=1" in wrapper


def test_role_bootstrap_fails_closed_when_any_registry_password_is_missing() -> None:
    wrapper = REPO_ROOT / "infra/postgres/05-skill-registry-roles.sh"
    password_names = (
        "SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD",
        "SKILL_REGISTRY_DATABASE_PASSWORD",
        "SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD",
    )
    base_environment = {
        "PATH": "/usr/bin:/bin",
        "POSTGRES_USER": "postgres",
        "POSTGRES_DB": "platform",
        "POSTGRES_PASSWORD": "owner-private-password",
        **{name: f"{name.lower()}-private-password" for name in password_names},
    }

    for missing_name in password_names:
        environment = dict(base_environment)
        del environment[missing_name]
        result = subprocess.run(
            [str(wrapper)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0
        assert missing_name in result.stderr
        assert "private-password" not in result.stderr


def test_role_bootstrap_rejects_any_registry_role_membership_before_alter_or_grant() -> None:
    role_sql = (REPO_ROOT / "infra/postgres/05-skill-registry-roles.sql").read_text()
    normalized = normalize_sql(role_sql)
    membership_guard_offset = normalized.index("FROM pg_auth_members")

    assert "JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid" in normalized
    assert "JOIN pg_roles AS member_role ON member_role.oid = membership.member" in normalized
    assert "granted_role.rolname IN" in normalized
    assert "member_role.rolname IN" in normalized
    assert "skill registry roles must not have role memberships" in normalized
    assert membership_guard_offset < normalized.index("ALTER ROLE ai_agent_skill_registry_migrator")
    assert membership_guard_offset < normalized.index("GRANT CONNECT ON DATABASE")


def test_role_bootstrap_resets_role_settings_and_seals_replication_bypass() -> None:
    role_sql = (REPO_ROOT / "infra/postgres/05-skill-registry-roles.sql").read_text()
    normalized = normalize_sql(role_sql)

    for role_name in ROLE_NAMES:
        assert f"ALTER ROLE {role_name} RESET ALL;" in normalized
        assert f'ALTER ROLE {role_name} IN DATABASE :"DBNAME" RESET ALL;' in normalized
    assert "FROM pg_db_role_setting AS role_setting" in normalized
    assert "skill registry roles must not retain role settings" in normalized
    assert (
        "REVOKE SET ON PARAMETER session_replication_role FROM "
        "ai_agent_skill_registry_migrator, ai_agent_skill_registry_manager, "
        "ai_agent_skill_registry_runtime"
    ) in normalized
    assert "pg_catalog.has_parameter_privilege" in normalized
    assert "registry roles must not set session_replication_role" in normalized


def test_schema_version_one_remains_the_exact_historical_registry_bootstrap() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert REQUIRED_TABLE_NAMES == frozenset(
        {
            "skills",
            "skill_revisions",
            "skill_revision_artifacts",
            "skill_revision_files",
            "skill_control_events",
        }
    )
    for table_name in REQUIRED_TABLE_NAMES:
        assert f"CREATE TABLE skill_registry.{table_name}" in sql
    assert "%s" not in PREPARE_SCHEMA_SQL + SCHEMA_VERSION_1_SQL


def test_schema_v2_renames_review_authorization_evidence() -> None:
    sql = normalize_sql(SCHEMA_VERSION_2_SQL)

    assert SKILL_REGISTRY_SCHEMA_VERSION == 2
    assert "DROP CONSTRAINT skill_control_events_review_evidence" in sql
    assert "RENAME COLUMN independent_reviewer_confirmed" in sql
    assert "TO reviewer_authorization_confirmed" in sql
    assert "reviewer_authorization_confirmed IS TRUE" in sql
    assert "reviewer_authorization_confirmed IS NULL" in sql
    assert "NEW.reviewed_by = OLD.created_by" not in sql
    assert "skill revision review requires a second actor" not in sql
    assert "INSERT INTO skill_registry.schema_versions (version) VALUES (2)" in sql


def test_schema_v2_replaces_only_the_second_actor_revision_guard() -> None:
    version_one = normalize_sql(SCHEMA_VERSION_1_SQL)
    version_two = normalize_sql(SCHEMA_VERSION_2_SQL)

    for preserved_guard in (
        "NEW.id IS DISTINCT FROM OLD.id",
        "NEW.findings IS DISTINCT FROM OLD.findings",
        "NEW.created_at IS DISTINCT FROM OLD.created_at",
        "skill revision body is immutable",
        "OLD.state = 'pending_review' AND NEW.state IN ('published', 'rejected')",
        "NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL",
        "OLD.state = 'published' AND NEW.state = 'archived'",
        "NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by",
        "review metadata is immutable after review",
        "invalid skill revision state transition",
    ):
        assert preserved_guard in version_one
        assert preserved_guard in version_two
    assert "NEW.reviewed_by = OLD.created_by" in version_one
    assert "NEW.reviewed_by = OLD.created_by" not in version_two

    guard_start = "CREATE OR REPLACE FUNCTION skill_registry.guard_revision_update()"
    version_one_guard = SCHEMA_VERSION_1_SQL[
        SCHEMA_VERSION_1_SQL.index(guard_start) : SCHEMA_VERSION_1_SQL.index(
            "CREATE OR REPLACE FUNCTION skill_registry.guard_revision_insert()"
        )
    ]
    version_two_guard = SCHEMA_VERSION_2_SQL[
        SCHEMA_VERSION_2_SQL.index(guard_start) : SCHEMA_VERSION_2_SQL.index(
            "INSERT INTO skill_registry.schema_versions"
        )
    ]
    second_actor_rejection = """    IF NEW.reviewed_by = OLD.created_by THEN
      RAISE EXCEPTION 'skill revision review requires a second actor'
        USING ERRCODE = '23514';
    END IF;
"""
    assert normalize_sql(version_two_guard) == normalize_sql(
        version_one_guard.replace(second_actor_rejection, "")
    )


def test_schema_has_permanent_identity_revision_and_nonce_uniqueness() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "slug varchar(128) NOT NULL UNIQUE" in sql
    assert "UNIQUE (skill_id, revision_no)" in sql
    assert "UNIQUE (skill_id, artifact_sha256)" in sql
    assert "assertion_nonce uuid UNIQUE" in sql
    assert "FROM skill_registry.skills" not in sql.split("CREATE TABLE skill_registry.skills", 1)[0]


def test_schema_enforces_registry_enums_digests_and_archive_limits() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "state IN ('pending_review','published','rejected','archived')" in sql
    assert "source_type IN ('upload','github','gitlab','gitcode')" in sql
    assert "artifact_sha256 ~ '^[0-9a-f]{64}$'" in sql
    assert "file_sha256 ~ '^[0-9a-f]{64}$'" in sql
    assert "compressed_size BETWEEN 1 AND 5242880" in sql
    assert "extracted_size BETWEEN 1 AND 20971520" in sql
    assert "file_count BETWEEN 1 AND 128" in sql


def test_control_events_require_a_nonce_only_for_mutations() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    for column in (
        "request_id uuid NOT NULL",
        "assertion_nonce uuid UNIQUE",
        "actor varchar(255) NOT NULL",
        "event_type varchar(64) NOT NULL",
        "target_id uuid NOT NULL",
        "result_code varchar(32) NOT NULL",
        "error_code varchar(64)",
        "created_at timestamptz NOT NULL DEFAULT now()",
    ):
        assert column in sql
    assert "event_type IN ('skill_read','revision_read') OR assertion_nonce IS NOT NULL" in sql


def test_update_triggers_enforce_immutable_identity_and_forward_only_state() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    for immutable_skill_column in ("id", "slug", "created_by", "created_at"):
        assert f"NEW.{immutable_skill_column} IS DISTINCT FROM OLD.{immutable_skill_column}" in sql
    assert "OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL" in sql
    for immutable_revision_column in (
        "id",
        "skill_id",
        "revision_no",
        "source_type",
        "source_url",
        "source_ref",
        "source_commit",
        "manifest",
        "created_by",
        "created_at",
    ):
        assert (
            f"NEW.{immutable_revision_column} IS DISTINCT FROM OLD.{immutable_revision_column}"
            in sql
        )
    assert "OLD.state = 'pending_review' AND NEW.state IN ('published', 'rejected')" in sql
    assert "OLD.state = 'published' AND NEW.state = 'archived'" in sql
    for table_name in (
        "skill_revision_artifacts",
        "skill_revision_files",
        "skill_control_events",
    ):
        assert f"BEFORE UPDATE OR DELETE ON skill_registry.{table_name}" in sql


def test_revision_insert_trigger_requires_clean_pending_review_state() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "CREATE OR REPLACE FUNCTION skill_registry.guard_revision_insert()" in sql
    assert "NEW.state <> 'pending_review'" in sql
    assert "NEW.reviewed_by IS NOT NULL" in sql
    assert "NEW.reviewed_at IS NOT NULL" in sql
    assert "new skill revisions must start pending review" in sql
    assert "USING ERRCODE = '23514'" in sql
    assert "BEFORE INSERT ON skill_registry.skill_revisions" in sql
    assert "EXECUTE FUNCTION skill_registry.guard_revision_insert()" in sql


def test_review_transition_requires_a_second_actor_and_same_transaction_event() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "NEW.reviewed_by = OLD.created_by" in sql
    assert "skill revision review requires a second actor" in sql
    assert "transaction_id bigint NOT NULL" in sql
    assert "NEW.transaction_id := pg_catalog.txid_current()" in sql
    assert "BEFORE INSERT ON skill_registry.skill_control_events" in sql
    assert "CREATE OR REPLACE FUNCTION skill_registry.require_revision_review_event()" in sql
    assert "event.transaction_id = pg_catalog.txid_current()" in sql
    assert "event.target_id = NEW.id" in sql
    assert "event.actor = NEW.reviewed_by::text" in sql
    assert "event.result_code = 'ok'" in sql
    assert "WHEN NEW.state = 'published' THEN 'revision_published'" in sql
    assert "WHEN NEW.state = 'rejected' THEN 'revision_rejected'" in sql
    assert "CREATE CONSTRAINT TRIGGER skill_revisions_require_review_event" in sql
    assert "DEFERRABLE INITIALLY DEFERRED" in sql


def test_findings_schema_is_closed_and_rechecked_before_publication() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "CREATE OR REPLACE FUNCTION skill_registry.validate_skill_findings" in sql
    assert "RETURNS boolean" in sql
    assert "LANGUAGE sql" in sql
    assert "IMMUTABLE STRICT PARALLEL SAFE" in sql
    assert "jsonb_typeof(candidate) <> 'array'" in sql
    assert "jsonb_typeof(finding) <> 'object'" in sql
    assert "SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(finding)" in sql
    assert "finding ?& ARRAY['path', 'line', 'code', 'message', 'blocking']" in sql
    assert "jsonb_typeof(finding -> 'line') <> 'number'" in sql
    assert "finding ->> 'line' !~ '^[1-9][0-9]*$'" in sql
    for finding_code in (
        "possible_secret",
        "private_key",
        "network_access",
        "subprocess",
        "environment_read",
        "dynamic_code",
        "filesystem_write",
        "unsupported_import",
        "external_url",
    ):
        assert f"'{finding_code}'" in sql
    assert (
        "CONSTRAINT skill_revisions_findings_array "
        "CHECK (skill_registry.validate_skill_findings(findings))"
    ) in sql
    assert (
        "IF skill_registry.validate_skill_findings(OLD.findings) IS DISTINCT FROM TRUE THEN" in sql
    )
    assert "skill findings schema is invalid" in sql
    assert "OWNER TO ai_agent_skill_registry_migrator" in sql
    assert "REVOKE ALL ON FUNCTION skill_registry.validate_skill_findings(jsonb) FROM PUBLIC" in sql
    assert (
        "GRANT EXECUTE ON FUNCTION skill_registry.validate_skill_findings(jsonb) "
        "TO ai_agent_skill_registry_manager"
    ) in sql


def test_security_functions_pin_search_path_and_triggers_are_always_enabled() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert sql.count("SET search_path = pg_catalog, skill_registry") == 7
    assert sql.count("pg_catalog.txid_current()") == 2
    for trigger_name in (
        "skills_guard_update",
        "skill_revisions_guard_update",
        "skill_revisions_guard_insert",
        "skill_revisions_require_review_event",
        "skill_control_events_stamp_transaction",
        "skill_revision_artifacts_append_only",
        "skill_revision_files_append_only",
        "skill_control_events_append_only",
    ):
        assert f"ENABLE ALWAYS TRIGGER {trigger_name}" in sql


def test_manager_backup_runtime_and_foreign_role_grants_are_narrow() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "GRANT USAGE ON SCHEMA skill_registry TO ai_agent_skill_registry_manager" in sql
    assert "GRANT SELECT ON skill_registry.skills, skill_registry.skill_revisions" in sql
    assert "GRANT INSERT ON skill_registry.skills, skill_registry.skill_revisions" in sql
    assert "GRANT UPDATE (archived_at) ON skill_registry.skills" in sql
    assert "GRANT UPDATE (state, reviewed_by, reviewed_at) ON skill_registry.skill_revisions" in sql
    assert "GRANT USAGE ON SCHEMA skill_registry TO ai_agent_backup" in sql
    assert "GRANT SELECT ON ALL TABLES IN SCHEMA skill_registry TO ai_agent_backup" in sql
    assert "GRANT" not in " ".join(
        statement
        for statement in sql.split(";")
        if "ai_agent_skill_registry_runtime" in statement and statement.strip().startswith("GRANT")
    )
    assert "REVOKE ALL ON ALL TABLES IN SCHEMA skill_registry FROM PUBLIC" in sql
    for role_name in (
        "ai_agent_migrator",
        "ai_agent_runtime",
        "ai_agent_agno_migrator",
        "ai_agent_agno",
        "ai_agent_control_migrator",
        "ai_agent_control",
    ):
        assert role_name in sql


def test_schema_versioning_is_literal_and_idempotent() -> None:
    prepare = normalize_sql(PREPARE_SCHEMA_SQL)
    version_one = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "CREATE TABLE IF NOT EXISTS skill_registry.schema_versions" in prepare
    assert "INSERT INTO skill_registry.schema_versions (version) VALUES (1)" in version_one
    assert "ON CONFLICT (version) DO NOTHING" in version_one
