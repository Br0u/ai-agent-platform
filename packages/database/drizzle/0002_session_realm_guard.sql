CREATE OR REPLACE FUNCTION enforce_session_identity_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  authoritative_realm identity_realm;
  authoritative_status user_status;
BEGIN
  SELECT users.identity_realm, users.status
    INTO authoritative_realm, authoritative_status
    FROM users
    WHERE users.id = NEW.user_id
    FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session user does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.realm <> authoritative_realm THEN
    RAISE EXCEPTION 'session realm does not match user realm'
      USING ERRCODE = '23514';
  END IF;

  IF authoritative_status = 'disabled' THEN
    RAISE EXCEPTION 'disabled user cannot create a session'
      USING ERRCODE = '23514';
  END IF;

  IF authoritative_realm = 'workforce'
     AND authoritative_status <> 'active' THEN
    RAISE EXCEPTION 'workforce user must be active to create a session'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sessions_identity_boundary_guard
BEFORE INSERT OR UPDATE OF user_id, realm
ON sessions
FOR EACH ROW
EXECUTE FUNCTION enforce_session_identity_boundary();
