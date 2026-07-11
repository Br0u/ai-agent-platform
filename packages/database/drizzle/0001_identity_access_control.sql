CREATE TYPE "public"."role_realm_scope" AS ENUM('customer', 'workforce', 'global');--> statement-breakpoint
CREATE TYPE "public"."email_verification_status" AS ENUM('unverified', 'pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."identity_realm" AS ENUM('customer', 'workforce');--> statement-breakpoint
CREATE TYPE "public"."organization_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('pending_review', 'active', 'disabled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending_review', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."user_status_new" AS ENUM('pending_review', 'active', 'disabled', 'rejected');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" TYPE "public"."user_status_new" USING "status"::text::"public"."user_status_new";--> statement-breakpoint
DROP TYPE "public"."user_status";--> statement-breakpoint
ALTER TYPE "public"."user_status_new" RENAME TO "user_status";--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_realm" "identity_realm",
	"actor_user_id" uuid,
	"action" varchar(160) NOT NULL,
	"target_type" varchar(120) NOT NULL,
	"target_id" text,
	"metadata" jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(160) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"realm" "identity_realm" NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "two_factors_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(320) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_member_role" DEFAULT 'member' NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"legal_name_key" varchar(240) NOT NULL,
	"status" "organization_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_legal_name_key_unique" UNIQUE("legal_name_key"),
	CONSTRAINT "organizations_legal_name_key_normalized_check" CHECK ("legal_name_key" <> '' AND "legal_name_key" = lower("legal_name_key") AND "legal_name_key" = regexp_replace("legal_name_key", '^[[:space:]]+|[[:space:]]+$', '', 'g') AND "legal_name_key" !~ '[[:space:]]{2,}')
);
--> statement-breakpoint
CREATE TABLE "customer_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"status" "registration_status" DEFAULT 'pending_review' NOT NULL,
	"reviewer_user_id" uuid,
	"review_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "display_name" TO "name";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "new_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
INSERT INTO "user_roles" ("id", "user_id", "role_id", "created_at")
SELECT gen_random_uuid(), "users"."id", "roles"."new_id", now()
FROM "users"
INNER JOIN "roles" ON "roles"."id" = "users"."role_id";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_pkey";--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "roles" RENAME COLUMN "new_id" TO "id";--> statement-breakpoint
ALTER TABLE "roles" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending_review'::"public"."user_status";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "realm_scope" "role_realm_scope" DEFAULT 'workforce' NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "realm_scope" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_realm" "identity_realm" DEFAULT 'workforce' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "identity_realm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_status" "email_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_username" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registrations" ADD CONSTRAINT "customer_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registrations" ADD CONSTRAINT "customer_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registrations" ADD CONSTRAINT "customer_registrations_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_roles_assigned_by_user_id_idx" ON "user_roles" USING btree ("assigned_by_user_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_assigned_by_user_id_idx" ON "organization_memberships" USING btree ("assigned_by_user_id");--> statement-breakpoint
CREATE INDEX "customer_registrations_user_id_idx" ON "customer_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_registrations_organization_id_idx" ON "customer_registrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_registrations_reviewer_user_id_idx" ON "customer_registrations" USING btree ("reviewer_user_id");--> statement-breakpoint
INSERT INTO "accounts" (
	"id",
	"account_id",
	"provider_id",
	"user_id",
	"password",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid(),
	"id"::text,
	'credential',
	"id",
	"password_hash",
	"created_at",
	"updated_at"
FROM "users";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role_id";--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_realm_scope_unique" UNIQUE("name","realm_scope");--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));
