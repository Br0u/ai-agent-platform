"""Immutable schema-v3 SQL for reviewed Skill runtime sets."""

SKILL_SET_TABLE_NAMES = frozenset(
    {
        "agent_skill_sets",
        "agent_skill_set_items",
        "active_agent_skill_sets",
        "skill_set_control_events",
    }
)

MANAGER_SKILL_SET_VIEW_NAMES = frozenset(
    {
        "manager_active_skill_set",
        "manager_skill_sets",
        "manager_skill_set_items",
    }
)

RUNTIME_SKILL_SET_VIEW_NAMES = frozenset(
    {
        "runtime_active_skill_set",
        "runtime_skill_sets",
        "runtime_skill_set_items",
    }
)

SCHEMA_VERSION_3_SQL = """
CREATE TABLE skill_registry.agent_skill_sets (
  id uuid PRIMARY KEY,
  agent_id varchar(64) NOT NULL DEFAULT 'maduoduo'
    CHECK (agent_id = 'maduoduo'),
  set_no bigint NOT NULL CHECK (set_no >= 1),
  state varchar(24) NOT NULL
    CHECK (state IN ('candidate','active','superseded','failed','discarded')),
  created_by uuid NOT NULL,
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  item_count smallint NOT NULL DEFAULT 0 CHECK (item_count BETWEEN 0 AND 16),
  total_extracted_size bigint NOT NULL DEFAULT 0
    CHECK (total_extracted_size BETWEEN 0 AND 25165824),
  failure_code varchar(64)
    CHECK (failure_code IS NULL OR failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  failed_at timestamptz,
  discarded_at timestamptz,
  UNIQUE (id, agent_id),
  UNIQUE (agent_id, set_no),
  UNIQUE (created_by, agent_id, request_id),
  CHECK (
    (state = 'candidate' AND failure_code IS NULL AND activated_at IS NULL
      AND failed_at IS NULL AND discarded_at IS NULL)
    OR (state = 'active' AND failure_code IS NULL AND activated_at IS NOT NULL
      AND failed_at IS NULL AND discarded_at IS NULL)
    OR (state = 'superseded' AND failure_code IS NULL AND activated_at IS NOT NULL
      AND failed_at IS NULL AND discarded_at IS NULL)
    OR (state = 'failed' AND failure_code IS NOT NULL AND activated_at IS NULL
      AND failed_at IS NOT NULL AND discarded_at IS NULL)
    OR (state = 'discarded' AND failure_code IS NULL AND activated_at IS NULL
      AND failed_at IS NULL AND discarded_at IS NOT NULL)
  )
);

CREATE TABLE skill_registry.agent_skill_set_items (
  set_id uuid NOT NULL,
  agent_id varchar(64) NOT NULL DEFAULT 'maduoduo'
    CHECK (agent_id = 'maduoduo'),
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
  skill_id uuid NOT NULL,
  skill_revision_id uuid NOT NULL,
  PRIMARY KEY (set_id, ordinal),
  UNIQUE (set_id, skill_id),
  UNIQUE (set_id, skill_revision_id),
  FOREIGN KEY (set_id, agent_id)
    REFERENCES skill_registry.agent_skill_sets(id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (skill_revision_id, skill_id)
    REFERENCES skill_registry.skill_revisions(id, skill_id) ON DELETE RESTRICT
);

CREATE TABLE skill_registry.active_agent_skill_sets (
  agent_id varchar(64) PRIMARY KEY DEFAULT 'maduoduo'
    CHECK (agent_id = 'maduoduo'),
  active_set_id uuid NOT NULL,
  previous_set_id uuid,
  activation_version bigint NOT NULL CHECK (activation_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (active_set_id, agent_id)
    REFERENCES skill_registry.agent_skill_sets(id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_set_id, agent_id)
    REFERENCES skill_registry.agent_skill_sets(id, agent_id) ON DELETE RESTRICT,
  CHECK (previous_set_id IS NULL OR previous_set_id <> active_set_id)
);

CREATE TABLE skill_registry.skill_set_control_events (
  id uuid PRIMARY KEY,
  actor uuid NOT NULL,
  action varchar(64) NOT NULL
    CHECK (action IN (
      'skill_set_create',
      'skill_set_discard',
      'skill_set_clone',
      'skill_set_activate',
      'skill_set_fail'
    )),
  event_type varchar(32) NOT NULL
    CHECK (event_type IN (
      'skill_set_created',
      'skill_set_discarded',
      'skill_set_cloned',
      'skill_set_activated',
      'skill_set_failed'
    )),
  target varchar(160) NOT NULL CHECK (btrim(target) <> ''),
  request_id uuid NOT NULL,
  assertion_nonce uuid NOT NULL UNIQUE,
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result_set_id uuid REFERENCES skill_registry.agent_skill_sets(id) ON DELETE RESTRICT,
  result_set_state varchar(24)
    CHECK (
      result_set_state IS NULL
      OR result_set_state IN ('candidate','active','superseded','failed','discarded')
    ),
  result_activation_version bigint
    CHECK (result_activation_version IS NULL OR result_activation_version > 0),
  error_code varchar(64)
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor, action, target, request_id),
  CHECK (
    (action = 'skill_set_create' AND event_type = 'skill_set_created')
    OR (action = 'skill_set_discard' AND event_type = 'skill_set_discarded')
    OR (action = 'skill_set_clone' AND event_type = 'skill_set_cloned')
    OR (action = 'skill_set_activate' AND event_type = 'skill_set_activated')
    OR (action = 'skill_set_fail' AND event_type = 'skill_set_failed')
  ),
  CHECK (
    (event_type IN ('skill_set_created', 'skill_set_cloned')
      AND result_set_id IS NOT NULL AND result_set_state = 'candidate'
      AND result_activation_version IS NULL AND error_code IS NULL)
    OR (event_type = 'skill_set_discarded'
      AND result_set_id IS NOT NULL AND result_set_state = 'discarded'
      AND result_activation_version IS NULL AND error_code IS NULL)
    OR (event_type = 'skill_set_activated'
      AND result_set_id IS NOT NULL AND result_set_state = 'active'
      AND result_activation_version IS NOT NULL AND error_code IS NULL)
    OR (event_type = 'skill_set_failed'
      AND result_set_id IS NOT NULL AND result_set_state = 'failed'
      AND result_activation_version IS NULL AND error_code IS NOT NULL)
  )
);

ALTER TABLE skill_registry.agent_skill_sets
  OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.agent_skill_set_items
  OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.active_agent_skill_sets
  OWNER TO ai_agent_skill_registry_migrator;
ALTER TABLE skill_registry.skill_set_control_events
  OWNER TO ai_agent_skill_registry_migrator;

CREATE OR REPLACE FUNCTION skill_registry.guard_agent_skill_set_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.set_no IS DISTINCT FROM OLD.set_no
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'skill set identity and request fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.state = OLD.state THEN
    IF OLD.state <> 'candidate'
      OR NEW.failure_code IS DISTINCT FROM OLD.failure_code
      OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.failed_at IS DISTINCT FROM OLD.failed_at
      OR NEW.discarded_at IS DISTINCT FROM OLD.discarded_at THEN
      RAISE EXCEPTION 'skill set content is immutable'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.item_count IS DISTINCT FROM OLD.item_count
    OR NEW.total_extracted_size IS DISTINCT FROM OLD.total_extracted_size THEN
    RAISE EXCEPTION 'skill set totals cannot change during state transition'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.state = 'candidate' AND NEW.state = 'active' THEN
    IF NEW.activated_at IS NULL OR NEW.failure_code IS NOT NULL
      OR NEW.failed_at IS NOT NULL OR NEW.discarded_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid active skill set metadata' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state = 'candidate' AND NEW.state = 'failed' THEN
    IF NEW.failure_code IS NULL OR NEW.failed_at IS NULL
      OR NEW.activated_at IS NOT NULL OR NEW.discarded_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid failed skill set metadata' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state = 'candidate' AND NEW.state = 'discarded' THEN
    IF NEW.discarded_at IS NULL OR NEW.failure_code IS NOT NULL
      OR NEW.activated_at IS NOT NULL OR NEW.failed_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid discarded skill set metadata' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state = 'active' AND NEW.state = 'superseded' THEN
    IF NEW.failure_code IS NOT NULL OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.failed_at IS NOT NULL OR NEW.discarded_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid superseded skill set metadata' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid skill set state transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.validate_agent_skill_set_contents()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  target_set_id uuid;
  stored_item_count bigint;
  actual_item_count bigint;
  actual_total_size bigint;
  published_item_count bigint;
BEGIN
  target_set_id := COALESCE(NEW.set_id, OLD.set_id);
  SELECT count(*) INTO stored_item_count
  FROM skill_registry.agent_skill_set_items AS item
  WHERE item.set_id = target_set_id;
  SELECT
    count(*),
    COALESCE(sum(artifact.extracted_size), 0),
    count(*) FILTER (WHERE revision.state = 'published')
  INTO actual_item_count, actual_total_size, published_item_count
  FROM skill_registry.agent_skill_set_items AS item
  JOIN skill_registry.skill_revisions AS revision
    ON revision.id = item.skill_revision_id AND revision.skill_id = item.skill_id
  JOIN skill_registry.skill_revision_artifacts AS artifact
    ON artifact.revision_id = revision.id AND artifact.skill_id = revision.skill_id
  WHERE item.set_id = target_set_id;

  IF actual_item_count <> stored_item_count
    OR actual_item_count > 16 OR actual_total_size > 25165824
    OR published_item_count <> actual_item_count THEN
    RAISE EXCEPTION 'invalid skill set contents' USING ERRCODE = '23514';
  END IF;

  UPDATE skill_registry.agent_skill_sets
  SET item_count = actual_item_count::smallint,
      total_extracted_size = actual_total_size
  WHERE id = target_set_id AND state = 'candidate';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'skill set content is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.guard_active_agent_skill_set_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.activation_version <> OLD.activation_version + 1
    OR NEW.previous_set_id IS DISTINCT FROM OLD.active_set_id
    OR NEW.active_set_id = OLD.active_set_id
    OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'invalid active skill set pointer transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION skill_registry.guard_agent_skill_set_update()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.validate_agent_skill_set_contents()
  OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.guard_active_agent_skill_set_update()
  OWNER TO ai_agent_skill_registry_migrator;
REVOKE ALL ON FUNCTION skill_registry.guard_agent_skill_set_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.validate_agent_skill_set_contents() FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.guard_active_agent_skill_set_update() FROM PUBLIC;

CREATE TRIGGER agent_skill_sets_guard_update
BEFORE UPDATE ON skill_registry.agent_skill_sets
FOR EACH ROW EXECUTE FUNCTION skill_registry.guard_agent_skill_set_update();
ALTER TABLE skill_registry.agent_skill_sets
  ENABLE ALWAYS TRIGGER agent_skill_sets_guard_update;

CREATE TRIGGER agent_skill_set_items_append_only
BEFORE UPDATE OR DELETE ON skill_registry.agent_skill_set_items
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.agent_skill_set_items
  ENABLE ALWAYS TRIGGER agent_skill_set_items_append_only;

CREATE CONSTRAINT TRIGGER agent_skill_set_items_validate
AFTER INSERT OR UPDATE OR DELETE ON skill_registry.agent_skill_set_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION skill_registry.validate_agent_skill_set_contents();
ALTER TABLE skill_registry.agent_skill_set_items
  ENABLE ALWAYS TRIGGER agent_skill_set_items_validate;

CREATE TRIGGER active_agent_skill_sets_guard_update
BEFORE UPDATE ON skill_registry.active_agent_skill_sets
FOR EACH ROW EXECUTE FUNCTION skill_registry.guard_active_agent_skill_set_update();
ALTER TABLE skill_registry.active_agent_skill_sets
  ENABLE ALWAYS TRIGGER active_agent_skill_sets_guard_update;

CREATE TRIGGER active_agent_skill_sets_deny_delete
BEFORE DELETE ON skill_registry.active_agent_skill_sets
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.active_agent_skill_sets
  ENABLE ALWAYS TRIGGER active_agent_skill_sets_deny_delete;

CREATE TRIGGER skill_set_control_events_append_only
BEFORE UPDATE OR DELETE ON skill_registry.skill_set_control_events
FOR EACH ROW EXECUTE FUNCTION skill_registry.deny_append_only_mutation();
ALTER TABLE skill_registry.skill_set_control_events
  ENABLE ALWAYS TRIGGER skill_set_control_events_append_only;

CREATE OR REPLACE FUNCTION skill_registry.protect_active_skill_revision_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF OLD.state = 'published' AND NEW.state = 'archived' AND EXISTS (
    SELECT 1
    FROM skill_registry.agent_skill_set_items AS item
    JOIN skill_registry.active_agent_skill_sets AS active_pointer
      ON active_pointer.agent_id = item.agent_id
    WHERE item.skill_revision_id = OLD.id
      AND item.set_id IN (
        active_pointer.active_set_id,
        active_pointer.previous_set_id
      )
  ) THEN
    RAISE EXCEPTION 'active or previous skill revision cannot be archived'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION skill_registry.protect_active_skill_revision_archive()
  OWNER TO ai_agent_skill_registry_migrator;
REVOKE ALL ON FUNCTION skill_registry.protect_active_skill_revision_archive() FROM PUBLIC;

CREATE TRIGGER skill_revisions_protect_active_archive
BEFORE UPDATE ON skill_registry.skill_revisions
FOR EACH ROW EXECUTE FUNCTION skill_registry.protect_active_skill_revision_archive();
ALTER TABLE skill_registry.skill_revisions
  ENABLE ALWAYS TRIGGER skill_revisions_protect_active_archive;

CREATE OR REPLACE FUNCTION skill_registry.create_agent_skill_set(
  p_agent_id text,
  p_revision_ids uuid[],
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64)
)
RETURNS TABLE(
  set_id uuid,
  replayed boolean,
  item_count smallint,
  total_extracted_size bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  replay_event skill_registry.skill_set_control_events%ROWTYPE;
  new_set_id uuid;
  next_set_no bigint;
  requested_item_count integer;
  selected_item_count bigint;
  distinct_revision_count bigint;
  distinct_skill_count bigint;
  selected_total_size bigint;
BEGIN
  IF session_user <> 'ai_agent_skill_registry_manager' THEN
    RAISE EXCEPTION 'manager database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' OR p_revision_ids IS NULL
    OR cardinality(p_revision_ids) > 16
    OR pg_catalog.array_position(p_revision_ids, NULL) IS NOT NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid skill set request' USING ERRCODE = '22023';
  END IF;

  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_create'
    AND event.target = p_agent_id
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY
      SELECT skill_set.id, true, skill_set.item_count, skill_set.total_extracted_size
      FROM skill_registry.agent_skill_sets AS skill_set
      WHERE skill_set.id = replay_event.result_set_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('skill_registry:maduoduo', 0)
  );
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_create'
    AND event.target = p_agent_id
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY
      SELECT skill_set.id, true, skill_set.item_count, skill_set.total_extracted_size
      FROM skill_registry.agent_skill_sets AS skill_set
      WHERE skill_set.id = replay_event.result_set_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;
  IF (
    SELECT count(*) FROM skill_registry.agent_skill_sets
    WHERE agent_id = p_agent_id AND state = 'candidate'
  ) >= 20 THEN
    RAISE EXCEPTION 'skill set candidate quota exceeded' USING ERRCODE = '54000';
  END IF;

  requested_item_count := cardinality(p_revision_ids);
  SELECT count(*), count(DISTINCT input.revision_id)
  INTO selected_item_count, distinct_revision_count
  FROM pg_catalog.unnest(p_revision_ids) AS input(revision_id);
  IF selected_item_count <> distinct_revision_count THEN
    RAISE EXCEPTION 'duplicate skill revision in candidate' USING ERRCODE = '22023';
  END IF;

  PERFORM revision.id
  FROM skill_registry.skill_revisions AS revision
  WHERE revision.id = ANY(p_revision_ids)
  ORDER BY revision.id
  FOR SHARE;
  SELECT
    count(*),
    count(DISTINCT revision.skill_id),
    COALESCE(sum(artifact.extracted_size), 0)
  INTO selected_item_count, distinct_skill_count, selected_total_size
  FROM skill_registry.skill_revisions AS revision
  JOIN skill_registry.skill_revision_artifacts AS artifact
    ON artifact.revision_id = revision.id AND artifact.skill_id = revision.skill_id
  WHERE revision.id = ANY(p_revision_ids) AND revision.state = 'published';
  IF selected_item_count <> requested_item_count
    OR distinct_skill_count <> selected_item_count
    OR selected_total_size > 25165824 THEN
    RAISE EXCEPTION 'invalid published skill revisions' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(skill_set.set_no), 0) + 1 INTO next_set_no
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.agent_id = p_agent_id;
  new_set_id := pg_catalog.gen_random_uuid();
  INSERT INTO skill_registry.agent_skill_sets (
    id, agent_id, set_no, state, created_by, request_id, request_fingerprint,
    item_count, total_extracted_size
  ) VALUES (
    new_set_id, p_agent_id, next_set_no, 'candidate', p_actor, p_request_id,
    p_request_fingerprint, selected_item_count::smallint, selected_total_size
  );
  INSERT INTO skill_registry.agent_skill_set_items (
    set_id, agent_id, ordinal, skill_id, skill_revision_id
  )
  SELECT
    new_set_id,
    p_agent_id,
    (input.ordinality - 1)::smallint,
    revision.skill_id,
    input.revision_id
  FROM pg_catalog.unnest(p_revision_ids) WITH ORDINALITY
    AS input(revision_id, ordinality)
  JOIN skill_registry.skill_revisions AS revision ON revision.id = input.revision_id
  ORDER BY input.ordinality;
  INSERT INTO skill_registry.skill_set_control_events (
    id, actor, action, event_type, target, request_id, assertion_nonce,
    request_fingerprint, result_set_id, result_set_state
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_actor, 'skill_set_create', 'skill_set_created',
    p_agent_id, p_request_id, p_assertion_nonce, p_request_fingerprint,
    new_set_id, 'candidate'
  );
  RETURN QUERY SELECT new_set_id, false, selected_item_count::smallint, selected_total_size;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.discard_agent_skill_set(
  p_agent_id text,
  p_set_id uuid,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64)
)
RETURNS TABLE(set_id uuid, state text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  canonical_target text;
  replay_event skill_registry.skill_set_control_events%ROWTYPE;
  candidate_state varchar(24);
BEGIN
  IF session_user <> 'ai_agent_skill_registry_manager' THEN
    RAISE EXCEPTION 'manager database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid discard request' USING ERRCODE = '22023';
  END IF;
  canonical_target := p_agent_id || ':' || p_set_id::text;
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_discard'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY SELECT replay_event.result_set_id, 'discarded'::text, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('skill_registry:maduoduo', 0)
  );
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_discard'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY SELECT replay_event.result_set_id, 'discarded'::text, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;
  SELECT skill_set.state INTO candidate_state
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.id = p_set_id AND skill_set.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND OR candidate_state <> 'candidate' THEN
    RAISE EXCEPTION 'skill set is not a candidate' USING ERRCODE = '40001';
  END IF;
  UPDATE skill_registry.agent_skill_sets
  SET state = 'discarded', discarded_at = pg_catalog.clock_timestamp()
  WHERE id = p_set_id;
  INSERT INTO skill_registry.skill_set_control_events (
    id, actor, action, event_type, target, request_id, assertion_nonce,
    request_fingerprint, result_set_id, result_set_state
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_actor, 'skill_set_discard', 'skill_set_discarded',
    canonical_target, p_request_id, p_assertion_nonce, p_request_fingerprint,
    p_set_id, 'discarded'
  );
  RETURN QUERY SELECT p_set_id, 'discarded'::text, false;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.clone_previous_agent_skill_set(
  p_agent_id text,
  p_expected_activation_version bigint,
  p_expected_previous_set_id uuid,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64)
)
RETURNS TABLE(
  set_id uuid,
  replayed boolean,
  item_count smallint,
  total_extracted_size bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  canonical_target text;
  replay_event skill_registry.skill_set_control_events%ROWTYPE;
  locked_activation_version bigint;
  locked_previous_set_id uuid;
  previous_state varchar(24);
  cloned_item_count smallint;
  cloned_total_size bigint;
  next_set_no bigint;
  new_set_id uuid;
BEGIN
  IF session_user <> 'ai_agent_skill_registry_manager' THEN
    RAISE EXCEPTION 'manager database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' OR p_expected_activation_version <= 0
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid clone request' USING ERRCODE = '22023';
  END IF;
  canonical_target := p_agent_id || ':previous';
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_clone'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY
      SELECT skill_set.id, true, skill_set.item_count, skill_set.total_extracted_size
      FROM skill_registry.agent_skill_sets AS skill_set
      WHERE skill_set.id = replay_event.result_set_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('skill_registry:maduoduo', 0)
  );
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_clone'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN QUERY
      SELECT skill_set.id, true, skill_set.item_count, skill_set.total_extracted_size
      FROM skill_registry.agent_skill_sets AS skill_set
      WHERE skill_set.id = replay_event.result_set_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;
  SELECT pointer.activation_version, pointer.previous_set_id
  INTO locked_activation_version, locked_previous_set_id
  FROM skill_registry.active_agent_skill_sets AS pointer
  WHERE pointer.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND OR locked_activation_version <> p_expected_activation_version
    OR locked_previous_set_id IS DISTINCT FROM p_expected_previous_set_id THEN
    RAISE EXCEPTION 'stale previous skill set pointer' USING ERRCODE = '40001';
  END IF;
  SELECT skill_set.state, skill_set.item_count, skill_set.total_extracted_size
  INTO previous_state, cloned_item_count, cloned_total_size
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.id = locked_previous_set_id AND skill_set.agent_id = p_agent_id
  FOR SHARE;
  IF NOT FOUND OR previous_state <> 'superseded' OR EXISTS (
    SELECT 1
    FROM skill_registry.agent_skill_set_items AS item
    JOIN skill_registry.skill_revisions AS revision
      ON revision.id = item.skill_revision_id AND revision.skill_id = item.skill_id
    WHERE item.set_id = locked_previous_set_id AND revision.state <> 'published'
  ) THEN
    RAISE EXCEPTION 'previous skill set is not cloneable' USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*) FROM skill_registry.agent_skill_sets
    WHERE agent_id = p_agent_id AND state = 'candidate'
  ) >= 20 THEN
    RAISE EXCEPTION 'skill set candidate quota exceeded' USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(max(skill_set.set_no), 0) + 1 INTO next_set_no
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.agent_id = p_agent_id;
  new_set_id := pg_catalog.gen_random_uuid();
  INSERT INTO skill_registry.agent_skill_sets (
    id, agent_id, set_no, state, created_by, request_id, request_fingerprint,
    item_count, total_extracted_size
  ) VALUES (
    new_set_id, p_agent_id, next_set_no, 'candidate', p_actor, p_request_id,
    p_request_fingerprint, cloned_item_count, cloned_total_size
  );
  INSERT INTO skill_registry.agent_skill_set_items (
    set_id, agent_id, ordinal, skill_id, skill_revision_id
  )
  SELECT new_set_id, p_agent_id, item.ordinal, item.skill_id, item.skill_revision_id
  FROM skill_registry.agent_skill_set_items AS item
  WHERE item.set_id = locked_previous_set_id
  ORDER BY item.ordinal;
  INSERT INTO skill_registry.skill_set_control_events (
    id, actor, action, event_type, target, request_id, assertion_nonce,
    request_fingerprint, result_set_id, result_set_state
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_actor, 'skill_set_clone', 'skill_set_cloned',
    canonical_target, p_request_id, p_assertion_nonce, p_request_fingerprint,
    new_set_id, 'candidate'
  );
  RETURN QUERY SELECT new_set_id, false, cloned_item_count, cloned_total_size;
END;
$$;

ALTER FUNCTION skill_registry.create_agent_skill_set(
  text, uuid[], uuid, uuid, uuid, char
) OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.discard_agent_skill_set(
  text, uuid, uuid, uuid, uuid, char
) OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.clone_previous_agent_skill_set(
  text, bigint, uuid, uuid, uuid, uuid, char
) OWNER TO ai_agent_skill_registry_migrator;
REVOKE ALL ON FUNCTION skill_registry.create_agent_skill_set(
  text, uuid[], uuid, uuid, uuid, char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.discard_agent_skill_set(
  text, uuid, uuid, uuid, uuid, char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.clone_previous_agent_skill_set(
  text, bigint, uuid, uuid, uuid, uuid, char
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION skill_registry.create_agent_skill_set(
  text, uuid[], uuid, uuid, uuid, char
) TO ai_agent_skill_registry_manager;
GRANT EXECUTE ON FUNCTION skill_registry.discard_agent_skill_set(
  text, uuid, uuid, uuid, uuid, char
) TO ai_agent_skill_registry_manager;
GRANT EXECUTE ON FUNCTION skill_registry.clone_previous_agent_skill_set(
  text, bigint, uuid, uuid, uuid, uuid, char
) TO ai_agent_skill_registry_manager;

CREATE OR REPLACE FUNCTION skill_registry.activate_agent_skill_set(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64)
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  canonical_target text;
  replay_event skill_registry.skill_set_control_events%ROWTYPE;
  current_active_set_id uuid;
  current_activation_version bigint;
  candidate_state varchar(24);
  next_activation_version bigint;
BEGIN
  IF session_user <> 'ai_agent_skill_registry_runtime' THEN
    RAISE EXCEPTION 'runtime database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' OR p_expected_activation_version < 0
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid activation request' USING ERRCODE = '22023';
  END IF;
  canonical_target := p_agent_id || ':' || p_set_id::text;

  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_activate'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN replay_event.result_activation_version;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('skill_registry:maduoduo', 0)
  );
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_activate'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN replay_event.result_activation_version;
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;
  SELECT pointer.active_set_id, pointer.activation_version
  INTO current_active_set_id, current_activation_version
  FROM skill_registry.active_agent_skill_sets AS pointer
  WHERE pointer.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    current_active_set_id := NULL;
    current_activation_version := 0;
  END IF;
  IF current_activation_version <> p_expected_activation_version THEN
    RAISE EXCEPTION 'stale skill set activation version' USING ERRCODE = '40001';
  END IF;

  SELECT skill_set.state INTO candidate_state
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.id = p_set_id AND skill_set.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND OR candidate_state <> 'candidate' THEN
    RAISE EXCEPTION 'skill set is not a candidate' USING ERRCODE = '40001';
  END IF;
  PERFORM revision.id
  FROM skill_registry.agent_skill_set_items AS item
  JOIN skill_registry.skill_revisions AS revision
    ON revision.id = item.skill_revision_id AND revision.skill_id = item.skill_id
  WHERE item.set_id = p_set_id
  ORDER BY revision.id
  FOR SHARE OF revision;
  IF EXISTS (
    SELECT 1
    FROM skill_registry.agent_skill_set_items AS item
    JOIN skill_registry.skill_revisions AS revision
      ON revision.id = item.skill_revision_id AND revision.skill_id = item.skill_id
    WHERE item.set_id = p_set_id AND revision.state <> 'published'
  ) THEN
    RAISE EXCEPTION 'candidate contains unpublished revision' USING ERRCODE = '23514';
  END IF;

  IF current_active_set_id IS NOT NULL THEN
    UPDATE skill_registry.agent_skill_sets
    SET state = 'superseded'
    WHERE id = current_active_set_id AND state = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'active skill set pointer is inconsistent' USING ERRCODE = '23514';
    END IF;
  END IF;
  UPDATE skill_registry.agent_skill_sets
  SET state = 'active', activated_at = pg_catalog.clock_timestamp()
  WHERE id = p_set_id;

  next_activation_version := current_activation_version + 1;
  IF current_activation_version = 0 THEN
    INSERT INTO skill_registry.active_agent_skill_sets (
      agent_id, active_set_id, previous_set_id, activation_version, updated_at
    ) VALUES (
      p_agent_id, p_set_id, NULL, next_activation_version, pg_catalog.clock_timestamp()
    );
  ELSE
    UPDATE skill_registry.active_agent_skill_sets
    SET active_set_id = p_set_id,
        previous_set_id = current_active_set_id,
        activation_version = next_activation_version,
        updated_at = pg_catalog.clock_timestamp()
    WHERE agent_id = p_agent_id;
  END IF;

  INSERT INTO skill_registry.skill_set_control_events (
    id, actor, action, event_type, target, request_id, assertion_nonce,
    request_fingerprint, result_set_id, result_set_state,
    result_activation_version
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_actor, 'skill_set_activate',
    'skill_set_activated', canonical_target, p_request_id, p_assertion_nonce,
    p_request_fingerprint, p_set_id, 'active', next_activation_version
  );
  RETURN next_activation_version;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.mark_agent_skill_set_failed(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64),
  p_failure_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
DECLARE
  canonical_target text;
  replay_event skill_registry.skill_set_control_events%ROWTYPE;
  current_activation_version bigint;
  candidate_state varchar(24);
BEGIN
  IF session_user <> 'ai_agent_skill_registry_runtime' THEN
    RAISE EXCEPTION 'runtime database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' OR p_expected_activation_version < 0
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_failure_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'invalid failure request' USING ERRCODE = '22023';
  END IF;
  canonical_target := p_agent_id || ':' || p_set_id::text;

  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_fail'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN replay_event.result_set_state = 'failed';
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('skill_registry:maduoduo', 0)
  );
  SELECT event.* INTO replay_event
  FROM skill_registry.skill_set_control_events AS event
  WHERE event.actor = p_actor
    AND event.action = 'skill_set_fail'
    AND event.target = canonical_target
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.request_fingerprint = p_request_fingerprint
      AND replay_event.assertion_nonce = p_assertion_nonce THEN
      RETURN replay_event.result_set_state = 'failed';
    END IF;
    RAISE EXCEPTION 'skill set idempotency conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM skill_registry.skill_set_control_events
    WHERE assertion_nonce = p_assertion_nonce
  ) THEN
    RAISE EXCEPTION 'skill set assertion nonce already used' USING ERRCODE = '23505';
  END IF;
  SELECT pointer.activation_version INTO current_activation_version
  FROM skill_registry.active_agent_skill_sets AS pointer
  WHERE pointer.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    current_activation_version := 0;
  END IF;
  IF current_activation_version <> p_expected_activation_version THEN
    RAISE EXCEPTION 'stale skill set activation version' USING ERRCODE = '40001';
  END IF;

  SELECT skill_set.state INTO candidate_state
  FROM skill_registry.agent_skill_sets AS skill_set
  WHERE skill_set.id = p_set_id AND skill_set.agent_id = p_agent_id
  FOR UPDATE;
  IF NOT FOUND OR candidate_state <> 'candidate' THEN
    RAISE EXCEPTION 'skill set is not a candidate' USING ERRCODE = '40001';
  END IF;
  UPDATE skill_registry.agent_skill_sets
  SET state = 'failed', failure_code = p_failure_code, failed_at = pg_catalog.clock_timestamp()
  WHERE id = p_set_id;

  INSERT INTO skill_registry.skill_set_control_events (
    id, actor, action, event_type, target, request_id, assertion_nonce,
    request_fingerprint, result_set_id, result_set_state, error_code
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_actor, 'skill_set_fail', 'skill_set_failed',
    canonical_target, p_request_id, p_assertion_nonce, p_request_fingerprint,
    p_set_id, 'failed', p_failure_code
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION skill_registry.reconcile_agent_skill_activation(
  p_agent_id text,
  p_target_set_id uuid
)
RETURNS TABLE(
  active_set_id uuid,
  previous_set_id uuid,
  activation_version bigint,
  target_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF session_user <> 'ai_agent_skill_registry_runtime' THEN
    RAISE EXCEPTION 'runtime database role is required' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id <> 'maduoduo' THEN
    RAISE EXCEPTION 'invalid agent id' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    pointer.active_set_id,
    pointer.previous_set_id,
    COALESCE(pointer.activation_version, 0),
    skill_set.state::text
  FROM (SELECT 1) AS singleton
  LEFT JOIN skill_registry.active_agent_skill_sets AS pointer
    ON pointer.agent_id = p_agent_id
  LEFT JOIN skill_registry.agent_skill_sets AS skill_set
    ON skill_set.id = p_target_set_id AND skill_set.agent_id = p_agent_id;
END;
$$;

ALTER FUNCTION skill_registry.activate_agent_skill_set(
  text, uuid, bigint, uuid, uuid, uuid, char
) OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.mark_agent_skill_set_failed(
  text, uuid, bigint, uuid, uuid, uuid, char, text
) OWNER TO ai_agent_skill_registry_migrator;
ALTER FUNCTION skill_registry.reconcile_agent_skill_activation(text, uuid)
  OWNER TO ai_agent_skill_registry_migrator;
REVOKE ALL ON FUNCTION skill_registry.activate_agent_skill_set(
  text, uuid, bigint, uuid, uuid, uuid, char
) FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.mark_agent_skill_set_failed(
  text, uuid, bigint, uuid, uuid, uuid, char, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION skill_registry.reconcile_agent_skill_activation(text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION skill_registry.activate_agent_skill_set(
  text, uuid, bigint, uuid, uuid, uuid, char
) TO ai_agent_skill_registry_runtime;
GRANT EXECUTE ON FUNCTION skill_registry.mark_agent_skill_set_failed(
  text, uuid, bigint, uuid, uuid, uuid, char, text
) TO ai_agent_skill_registry_runtime;
GRANT EXECUTE ON FUNCTION skill_registry.reconcile_agent_skill_activation(text, uuid)
  TO ai_agent_skill_registry_runtime;

CREATE VIEW skill_registry.runtime_active_skill_set AS
SELECT agent_id, active_set_id, previous_set_id, activation_version
FROM skill_registry.active_agent_skill_sets;

CREATE VIEW skill_registry.runtime_skill_sets AS
SELECT id AS set_id, agent_id, state, item_count, total_extracted_size
FROM skill_registry.agent_skill_sets;

CREATE VIEW skill_registry.runtime_skill_set_items AS
SELECT
  item.set_id,
  item.ordinal,
  item.skill_id,
  item.skill_revision_id AS revision_id,
  skill.slug,
  artifact.artifact_sha256,
  artifact.compressed_size,
  artifact.extracted_size,
  artifact.file_count,
  artifact.archive_bytes,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('path', file.path,
      'sha256', file.file_sha256,
      'size', file.size,
      'mediaType', file.media_type
    ) ORDER BY file.path)
    FROM skill_registry.skill_revision_files AS file
    WHERE file.revision_id = item.skill_revision_id
  ), '[]'::jsonb) AS file_index
FROM skill_registry.agent_skill_set_items AS item
JOIN skill_registry.skills AS skill ON skill.id = item.skill_id
JOIN skill_registry.skill_revision_artifacts AS artifact
  ON artifact.revision_id = item.skill_revision_id
  AND artifact.skill_id = item.skill_id;

CREATE VIEW skill_registry.manager_active_skill_set AS
SELECT agent_id, active_set_id, previous_set_id, activation_version
FROM skill_registry.active_agent_skill_sets;

CREATE VIEW skill_registry.manager_skill_sets AS
SELECT
  id AS set_id,
  agent_id,
  set_no,
  state,
  created_by,
  item_count,
  total_extracted_size,
  failure_code,
  created_at,
  activated_at,
  failed_at,
  discarded_at
FROM skill_registry.agent_skill_sets;

CREATE VIEW skill_registry.manager_skill_set_items AS
SELECT
  item.set_id,
  item.ordinal,
  item.skill_id,
  item.skill_revision_id AS revision_id,
  skill.slug,
  revision.revision_no,
  artifact.artifact_sha256,
  artifact.extracted_size
FROM skill_registry.agent_skill_set_items AS item
JOIN skill_registry.skills AS skill ON skill.id = item.skill_id
JOIN skill_registry.skill_revisions AS revision
  ON revision.id = item.skill_revision_id AND revision.skill_id = item.skill_id
JOIN skill_registry.skill_revision_artifacts AS artifact
  ON artifact.revision_id = item.skill_revision_id
  AND artifact.skill_id = item.skill_id;

ALTER VIEW skill_registry.runtime_active_skill_set
  OWNER TO ai_agent_skill_registry_migrator;
ALTER VIEW skill_registry.runtime_skill_sets
  OWNER TO ai_agent_skill_registry_migrator;
ALTER VIEW skill_registry.runtime_skill_set_items
  OWNER TO ai_agent_skill_registry_migrator;
ALTER VIEW skill_registry.manager_active_skill_set
  OWNER TO ai_agent_skill_registry_migrator;
ALTER VIEW skill_registry.manager_skill_sets
  OWNER TO ai_agent_skill_registry_migrator;
ALTER VIEW skill_registry.manager_skill_set_items
  OWNER TO ai_agent_skill_registry_migrator;

REVOKE ALL ON
  skill_registry.agent_skill_sets,
  skill_registry.agent_skill_set_items,
  skill_registry.active_agent_skill_sets,
  skill_registry.skill_set_control_events,
  skill_registry.runtime_active_skill_set,
  skill_registry.runtime_skill_sets,
  skill_registry.runtime_skill_set_items,
  skill_registry.manager_active_skill_set,
  skill_registry.manager_skill_sets,
  skill_registry.manager_skill_set_items
FROM PUBLIC, ai_agent_skill_registry_manager, ai_agent_skill_registry_runtime, ai_agent_backup;

GRANT USAGE ON SCHEMA skill_registry TO ai_agent_skill_registry_runtime;
GRANT SELECT ON skill_registry.runtime_active_skill_set,
  skill_registry.runtime_skill_sets,
  skill_registry.runtime_skill_set_items
TO ai_agent_skill_registry_runtime;
GRANT SELECT ON skill_registry.manager_active_skill_set,
  skill_registry.manager_skill_sets,
  skill_registry.manager_skill_set_items
TO ai_agent_skill_registry_manager;
GRANT SELECT ON skill_registry.agent_skill_sets,
  skill_registry.agent_skill_set_items,
  skill_registry.active_agent_skill_sets,
  skill_registry.skill_set_control_events
TO ai_agent_backup;

INSERT INTO skill_registry.schema_versions (version)
VALUES (3)
ON CONFLICT (version) DO NOTHING;
"""
