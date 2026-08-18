ALTER TABLE "download_resource_revisions" DROP CONSTRAINT "download_resource_revisions_artifacts_complete_check";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP CONSTRAINT "download_resource_revisions_page_count_positive_check";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP CONSTRAINT "download_resource_revisions_byte_size_positive_check";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP CONSTRAINT "download_resource_revisions_sha256_check";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ALTER COLUMN "resource_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "download_resources" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP COLUMN "pdf_object_key";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP COLUMN "cover_object_key";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP COLUMN "page_count";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP COLUMN "byte_size";--> statement-breakpoint
ALTER TABLE "download_resource_revisions" DROP COLUMN "sha256";