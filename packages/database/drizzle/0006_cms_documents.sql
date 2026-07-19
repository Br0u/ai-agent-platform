LOCK TABLE "permissions", "roles", "role_permissions" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "role_permissions" rp
		JOIN "permissions" p ON p.id = rp.permission_id
		JOIN "roles" r ON r.id = rp.role_id
		WHERE p.key = 'admin:docs:delete'
			AND (r.name <> 'super_admin' OR r.realm_scope <> 'workforce')
	) THEN
		RAISE EXCEPTION 'existing admin:docs:delete grant is invalid'
			USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE TYPE "public"."content_route_state" AS ENUM('reserved', 'canonical', 'alias');--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"slug" varchar(180) NOT NULL,
	"title" varchar(240) NOT NULL,
	"summary" varchar(500),
	"body" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_content_id_revision_unique" UNIQUE("content_id","revision"),
	CONSTRAINT "content_revisions_revision_positive_check" CHECK ("content_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_routes" (
	"slug" varchar(180) PRIMARY KEY NOT NULL,
	"content_id" uuid NOT NULL,
	"state" "content_route_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "published_revision" integer;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_routes" ADD CONSTRAINT "content_routes_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_routes_one_canonical_per_content_unique" ON "content_routes" USING btree ("content_id") WHERE "content_routes"."state" = 'canonical';--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_published_revision_fk" FOREIGN KEY ("id","published_revision") REFERENCES "public"."content_revisions"("content_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_revision_positive_check" CHECK ("content"."revision" > 0);--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_row_version_positive_check" CHECK ("content"."row_version" > 0);--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_published_revision_check" CHECK ("content"."published_revision" IS NULL OR ("content"."published_revision" > 0 AND "content"."published_revision" <= "content"."revision"));--> statement-breakpoint
CREATE FUNCTION "reject_content_revision_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'content revisions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "content_revisions_immutable"
BEFORE UPDATE OR DELETE ON "content_revisions"
FOR EACH ROW EXECUTE FUNCTION "reject_content_revision_mutation"();--> statement-breakpoint
CREATE FUNCTION "enforce_content_route_state_machine"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.state <> 'reserved' THEN
			RAISE EXCEPTION 'content routes must be inserted as reserved' USING ERRCODE = '23514';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'content routes are permanent' USING ERRCODE = '55000';
	END IF;

	IF NEW.slug IS DISTINCT FROM OLD.slug
		OR NEW.content_id IS DISTINCT FROM OLD.content_id THEN
		RAISE EXCEPTION 'content routes cannot be rebound' USING ERRCODE = '55000';
	END IF;

	IF (OLD.state = 'reserved' AND NEW.state = 'canonical')
		OR (OLD.state = 'canonical' AND NEW.state = 'alias') THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'invalid content route state transition: % -> %', OLD.state, NEW.state
		USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "content_routes_state_machine"
BEFORE INSERT OR UPDATE OR DELETE ON "content_routes"
FOR EACH ROW EXECUTE FUNCTION "enforce_content_route_state_machine"();--> statement-breakpoint
CREATE FUNCTION "enforce_admin_docs_delete_grant"() RETURNS trigger AS $$
DECLARE
	old_role_id uuid;
	new_role_id uuid;
	old_permission_id uuid;
	new_permission_id uuid;
	old_permission_key text;
	permission_key text;
	role_name text;
	role_realm text;
BEGIN
	IF TG_OP <> 'INSERT' THEN
		old_role_id := OLD.role_id;
		old_permission_id := OLD.permission_id;
	END IF;
	IF TG_OP <> 'DELETE' THEN
		new_role_id := NEW.role_id;
		new_permission_id := NEW.permission_id;
	END IF;

	PERFORM 1
	FROM "roles" r
	WHERE r.id = ANY(array_remove(ARRAY[old_role_id, new_role_id], NULL))
	ORDER BY r.id
	FOR SHARE OF r;
	PERFORM 1
	FROM "permissions" p
	WHERE p.id = ANY(array_remove(ARRAY[old_permission_id, new_permission_id], NULL))
	ORDER BY p.id
	FOR SHARE OF p;

	IF TG_OP <> 'INSERT' THEN
		SELECT p.key INTO old_permission_key
		FROM "permissions" p
		WHERE p.id = old_permission_id;

		IF old_permission_key = 'admin:docs:delete'
			AND (TG_OP = 'DELETE'
				OR NEW.permission_id IS DISTINCT FROM OLD.permission_id
				OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
			RAISE EXCEPTION 'super_admin admin:docs:delete grant is immutable'
				USING ERRCODE = '23514';
		END IF;

		IF TG_OP = 'DELETE' THEN
			RETURN OLD;
		END IF;
	END IF;

	SELECT r.name, r.realm_scope::text
	INTO role_name, role_realm
	FROM "roles" r
	WHERE r.id = new_role_id;
	SELECT p.key INTO permission_key
	FROM "permissions" p
	WHERE p.id = new_permission_id;

	IF permission_key = 'admin:docs:delete' THEN
		IF role_name IS DISTINCT FROM 'super_admin'
			OR role_realm IS DISTINCT FROM 'workforce' THEN
			RAISE EXCEPTION 'admin:docs:delete is restricted to workforce super_admin'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "role_permissions_admin_docs_delete_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "role_permissions"
FOR EACH ROW EXECUTE FUNCTION "enforce_admin_docs_delete_grant"();--> statement-breakpoint
CREATE FUNCTION "guard_admin_docs_delete_permission_key"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD.key = 'admin:docs:delete' THEN
			RAISE EXCEPTION 'admin:docs:delete permission is non-deletable'
				USING ERRCODE = '23514';
		END IF;
		RETURN OLD;
	END IF;

	IF OLD.key = 'admin:docs:delete' AND NEW.key IS DISTINCT FROM OLD.key THEN
		RAISE EXCEPTION 'admin:docs:delete permission key is immutable'
			USING ERRCODE = '23514';
	END IF;

	IF NEW.key = 'admin:docs:delete' AND OLD.key IS DISTINCT FROM NEW.key THEN
		RAISE EXCEPTION 'admin:docs:delete must be created with its reserved key'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "permissions_admin_docs_delete_key_guard"
BEFORE UPDATE OF "key" ON "permissions"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_docs_delete_permission_key"();--> statement-breakpoint
CREATE TRIGGER "permissions_admin_docs_delete_delete_guard"
BEFORE DELETE ON "permissions"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_docs_delete_permission_key"();--> statement-breakpoint
CREATE FUNCTION "guard_admin_docs_delete_role_identity"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD.name = 'super_admin' AND OLD.realm_scope = 'workforce' THEN
			RAISE EXCEPTION 'workforce super_admin role is non-deletable'
				USING ERRCODE = '23514';
		END IF;
		RETURN OLD;
	END IF;

	IF OLD.name = 'super_admin' AND OLD.realm_scope = 'workforce'
		AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.realm_scope IS DISTINCT FROM OLD.realm_scope) THEN
		RAISE EXCEPTION 'workforce super_admin identity is immutable'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "roles_admin_docs_delete_grant_guard"
BEFORE UPDATE OF "name", "realm_scope" ON "roles"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_docs_delete_role_identity"();--> statement-breakpoint
CREATE TRIGGER "roles_super_admin_delete_guard"
BEFORE DELETE ON "roles"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_docs_delete_role_identity"();
