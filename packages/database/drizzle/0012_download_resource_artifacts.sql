CREATE TYPE "public"."download_artifact_slot" AS ENUM('document', 'windows', 'macos');--> statement-breakpoint
CREATE TYPE "public"."download_resource_kind" AS ENUM('document', 'software');--> statement-breakpoint
ALTER TABLE "download_resources" ADD COLUMN "kind" "download_resource_kind" DEFAULT 'document' NOT NULL;--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD COLUMN "resource_kind" "download_resource_kind" DEFAULT 'document' NOT NULL;--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD COLUMN "release_version" varchar(40);--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ALTER COLUMN "preview_policy" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE "download_resource_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_kind" "download_resource_kind" NOT NULL,
	"slot" "download_artifact_slot" NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"extension" varchar(16) NOT NULL,
	"media_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"page_count" integer,
	"cover_object_key" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
UPDATE "download_resources"
SET "kind" = CASE WHEN "key" = 'mdd2-client' THEN 'software' ELSE 'document' END;--> statement-breakpoint
UPDATE "download_resource_revisions" revision
SET "resource_kind" = resource."kind"
FROM "download_resources" resource
WHERE resource."id" = revision."resource_id";--> statement-breakpoint
INSERT INTO "download_resource_artifacts" (
	"revision_id", "revision_kind", "slot", "object_key", "original_filename",
	"extension", "media_type", "byte_size", "sha256", "page_count", "cover_object_key"
)
SELECT
	revision."id", 'document', 'document', revision."pdf_object_key", resource."key" || '.pdf',
	'.pdf', 'application/pdf', revision."byte_size", revision."sha256", revision."page_count", revision."cover_object_key"
FROM "download_resource_revisions" revision
JOIN "download_resources" resource ON resource."id" = revision."resource_id"
WHERE revision."pdf_object_key" IS NOT NULL;--> statement-breakpoint
DO $$
DECLARE
	legacy_pdf_revisions integer;
	migrated_artifacts integer;
BEGIN
	SELECT count(*) INTO legacy_pdf_revisions
	FROM "download_resource_revisions"
	WHERE "pdf_object_key" IS NOT NULL;

	SELECT count(*) INTO migrated_artifacts
	FROM "download_resource_artifacts";

	IF legacy_pdf_revisions <> migrated_artifacts THEN
		RAISE EXCEPTION 'download resource artifact backfill count mismatch'
			USING ERRCODE = '23514', CONSTRAINT = 'download_resource_artifacts_backfill_count_check';
	END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "download_resource_artifacts" ADD CONSTRAINT "download_resource_artifacts_revision_id_slot_unique" UNIQUE("revision_id","slot");--> statement-breakpoint
ALTER TABLE "download_resource_artifacts" ADD CONSTRAINT "download_resource_artifacts_byte_size_positive_check" CHECK ("download_resource_artifacts"."byte_size" > 0);--> statement-breakpoint
ALTER TABLE "download_resource_artifacts" ADD CONSTRAINT "download_resource_artifacts_sha256_check" CHECK ("download_resource_artifacts"."sha256" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "download_resource_artifacts" ADD CONSTRAINT "download_resource_artifacts_kind_slot_file_check" CHECK ((
	"download_resource_artifacts"."revision_kind" = 'document'
	AND "download_resource_artifacts"."slot" = 'document'
	AND "download_resource_artifacts"."extension" = '.pdf'
	AND "download_resource_artifacts"."media_type" = 'application/pdf'
	AND "download_resource_artifacts"."page_count" IS NOT NULL
	AND "download_resource_artifacts"."page_count" > 0
	AND "download_resource_artifacts"."cover_object_key" IS NOT NULL
) OR (
	"download_resource_artifacts"."revision_kind" = 'software'
	AND "download_resource_artifacts"."page_count" IS NULL
	AND "download_resource_artifacts"."cover_object_key" IS NULL
	AND (
		("download_resource_artifacts"."slot" = 'windows' AND (
			("download_resource_artifacts"."extension" = '.exe' AND "download_resource_artifacts"."media_type" = 'application/vnd.microsoft.portable-executable')
			OR ("download_resource_artifacts"."extension" = '.msi' AND "download_resource_artifacts"."media_type" = 'application/x-msi')
			OR ("download_resource_artifacts"."extension" = '.zip' AND "download_resource_artifacts"."media_type" = 'application/zip')
		))
		OR ("download_resource_artifacts"."slot" = 'macos' AND (
			("download_resource_artifacts"."extension" = '.dmg' AND "download_resource_artifacts"."media_type" = 'application/x-apple-diskimage')
			OR ("download_resource_artifacts"."extension" = '.pkg' AND "download_resource_artifacts"."media_type" = 'application/vnd.apple.installer+xml')
			OR ("download_resource_artifacts"."extension" = '.zip' AND "download_resource_artifacts"."media_type" = 'application/zip')
		))
	)
));--> statement-breakpoint
ALTER TABLE "download_resources" ADD CONSTRAINT "download_resources_id_kind_unique" UNIQUE("id","kind");--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD CONSTRAINT "download_resource_revisions_id_kind_unique" UNIQUE("id","resource_kind");--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD CONSTRAINT "download_resource_revisions_resource_kind_fk" FOREIGN KEY ("resource_id","resource_kind") REFERENCES "public"."download_resources"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_resource_artifacts" ADD CONSTRAINT "download_resource_artifacts_revision_kind_fk" FOREIGN KEY ("revision_id","revision_kind") REFERENCES "public"."download_resource_revisions"("id","resource_kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD CONSTRAINT "download_resource_revisions_kind_policy_check" CHECK ((
	"download_resource_revisions"."resource_kind" = 'document'
	AND "download_resource_revisions"."release_version" IS NULL
	AND "download_resource_revisions"."preview_policy" IS NOT NULL
) OR (
	"download_resource_revisions"."resource_kind" = 'software'
	AND length(btrim("download_resource_revisions"."release_version")) BETWEEN 1 AND 40
	AND "download_resource_revisions"."release_version" !~ '[[:cntrl:]]'
	AND "download_resource_revisions"."preview_policy" IS NULL
	AND "download_resource_revisions"."download_policy" = 'public'
));--> statement-breakpoint
CREATE FUNCTION "enforce_download_resource_kind_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
		RAISE EXCEPTION 'download resource kind is immutable'
			USING ERRCODE = '23514', CONSTRAINT = 'download_resources_kind_immutable_check';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "download_resources_kind_immutable_guard"
BEFORE UPDATE OF "kind" ON "download_resources"
FOR EACH ROW EXECUTE FUNCTION "enforce_download_resource_kind_immutable"();
