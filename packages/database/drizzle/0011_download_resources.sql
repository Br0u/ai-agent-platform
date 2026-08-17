CREATE TYPE "public"."download_resource_access" AS ENUM('public', 'contact');--> statement-breakpoint
CREATE TYPE "public"."download_resource_category" AS ENUM('materials', 'software', 'deployment', 'whitepapers');--> statement-breakpoint
CREATE TYPE "public"."download_resource_state" AS ENUM('unpublished', 'published', 'downline');--> statement-breakpoint
CREATE TABLE "download_resource_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"name" varchar(240) NOT NULL,
	"product" varchar(80) NOT NULL,
	"category" "download_resource_category" NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"description" varchar(500) NOT NULL,
	"sort_order" integer NOT NULL,
	"preview_policy" "download_resource_access" NOT NULL,
	"download_policy" "download_resource_access" NOT NULL,
	"pdf_object_key" varchar(512),
	"cover_object_key" varchar(512),
	"page_count" integer,
	"byte_size" integer,
	"sha256" varchar(64),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"cleanup_pending_at" timestamp with time zone,
	"cleanup_error_summary" varchar(500),
	CONSTRAINT "download_resource_revisions_resource_id_id_unique" UNIQUE("resource_id","id"),
	CONSTRAINT "download_resource_revisions_artifacts_complete_check" CHECK (("download_resource_revisions"."pdf_object_key" IS NULL AND "download_resource_revisions"."cover_object_key" IS NULL AND "download_resource_revisions"."page_count" IS NULL AND "download_resource_revisions"."byte_size" IS NULL AND "download_resource_revisions"."sha256" IS NULL) OR ("download_resource_revisions"."pdf_object_key" IS NOT NULL AND "download_resource_revisions"."cover_object_key" IS NOT NULL AND "download_resource_revisions"."page_count" IS NOT NULL AND "download_resource_revisions"."byte_size" IS NOT NULL AND "download_resource_revisions"."sha256" IS NOT NULL)),
	CONSTRAINT "download_resource_revisions_page_count_positive_check" CHECK ("download_resource_revisions"."page_count" IS NULL OR "download_resource_revisions"."page_count" > 0),
	CONSTRAINT "download_resource_revisions_byte_size_positive_check" CHECK ("download_resource_revisions"."byte_size" IS NULL OR "download_resource_revisions"."byte_size" > 0),
	CONSTRAINT "download_resource_revisions_sha256_check" CHECK ("download_resource_revisions"."sha256" IS NULL OR "download_resource_revisions"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "download_resource_revisions_access_check" CHECK (NOT ("download_resource_revisions"."preview_policy" = 'contact' AND "download_resource_revisions"."download_policy" = 'public'))
);
--> statement-breakpoint
CREATE TABLE "download_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"admin_label" varchar(240) NOT NULL,
	"state" "download_resource_state" DEFAULT 'unpublished' NOT NULL,
	"published_revision_id" uuid,
	"draft_revision_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "download_resources_key_unique" UNIQUE("key"),
	CONSTRAINT "download_resources_row_version_positive_check" CHECK ("download_resources"."row_version" > 0),
	CONSTRAINT "download_resources_state_pointer_check" CHECK (("download_resources"."state" = 'published' AND "download_resources"."published_revision_id" IS NOT NULL) OR ("download_resources"."state" = 'unpublished' AND "download_resources"."published_revision_id" IS NULL) OR ("download_resources"."state" = 'downline' AND "download_resources"."published_revision_id" IS NULL AND "download_resources"."draft_revision_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD CONSTRAINT "download_resource_revisions_resource_id_download_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."download_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_resource_revisions" ADD CONSTRAINT "download_resource_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_resources" ADD CONSTRAINT "download_resources_published_revision_fk" FOREIGN KEY ("id","published_revision_id") REFERENCES "public"."download_resource_revisions"("resource_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_resources" ADD CONSTRAINT "download_resources_draft_revision_fk" FOREIGN KEY ("id","draft_revision_id") REFERENCES "public"."download_resource_revisions"("resource_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_resource_revisions_resource_sort_idx" ON "download_resource_revisions" USING btree ("resource_id","sort_order");--> statement-breakpoint
CREATE INDEX "download_resource_revisions_cleanup_pending_idx" ON "download_resource_revisions" USING btree ("cleanup_pending_at");--> statement-breakpoint
CREATE INDEX "download_resources_state_idx" ON "download_resources" USING btree ("state");--> statement-breakpoint
CREATE FUNCTION "enforce_download_resource_clean_pointer"() RETURNS trigger AS $$
BEGIN
	PERFORM 1
	FROM "download_resource_revisions" revision
	WHERE revision.resource_id = NEW.id
		AND revision.id = ANY(array_remove(ARRAY[NEW.published_revision_id, NEW.draft_revision_id], NULL))
	ORDER BY revision.id
	FOR SHARE;

	IF EXISTS (
		SELECT 1
		FROM "download_resource_revisions" revision
		WHERE revision.resource_id = NEW.id
			AND revision.id = ANY(array_remove(ARRAY[NEW.published_revision_id, NEW.draft_revision_id], NULL))
			AND revision.cleanup_pending_at IS NOT NULL
	) THEN
		RAISE EXCEPTION 'cleanup-pending revisions cannot be referenced'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "download_resources_clean_pointer_guard"
BEFORE INSERT OR UPDATE OF "published_revision_id", "draft_revision_id" ON "download_resources"
FOR EACH ROW EXECUTE FUNCTION "enforce_download_resource_clean_pointer"();--> statement-breakpoint
CREATE FUNCTION "guard_referenced_download_revision_cleanup"() RETURNS trigger AS $$
BEGIN
	IF NEW.cleanup_pending_at IS NOT NULL
		AND NEW.cleanup_pending_at IS DISTINCT FROM OLD.cleanup_pending_at
		AND EXISTS (
			SELECT 1
			FROM "download_resources" resource
			WHERE resource.published_revision_id = NEW.id
				OR resource.draft_revision_id = NEW.id
		) THEN
		RAISE EXCEPTION 'referenced revisions cannot become cleanup-pending'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "download_resource_revisions_cleanup_guard"
BEFORE UPDATE OF "cleanup_pending_at" ON "download_resource_revisions"
FOR EACH ROW EXECUTE FUNCTION "guard_referenced_download_revision_cleanup"();--> statement-breakpoint
INSERT INTO "download_resources" ("id", "key", "admin_label", "state", "created_at", "updated_at") VALUES
	('019faaaa-0000-7000-8000-000000000001', 'yuanqi-fullstack', '元启·全栈解决方案', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000002', 'yuanqi-appliance', '元启·开发一体机彩页', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000003', 'yuanqi-cases', '元启·案例集与场景汇总', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000004', 'yuanqi-folder', '元启·三折叠彩页', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000005', 'yuanqi-usage', '元启·用户使用手册', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000006', 'mdd2-intro', '码里奥·产品说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000007', 'mdd2-solution', '码里奥·智能编码解决方案', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000008', 'office-appliance', '办公·一体机彩页', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000009', 'office-doc', '办公·公文写作助手说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000010', 'office-contract', '办公·合同审核助手说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000011', 'office-bid', '办公·招投标智能体说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000012', 'daoban-appliance', '导办·一体机彩页', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000013', 'daoban-gov', '导办·政务智能体产品介绍', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000014', 'daoban-assistant', '导办·智能导办助手说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000015', 'vision-folder', '视觉·一体机三折页', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000016', 'vision-solution', '视觉·视频智能体解决方案', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000017', 'vision-intro', '视觉·产品说明书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000018', 'vision-usage', '视觉·用户使用手册', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000019', 'mdd2-client', '码里奥 桌面客户端', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000020', 'yuanqi-deploy', '元启·部署安装操作手册', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000021', 'yuanqi-faq', '元启·部署安装 FAQ', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-8000-000000000022', 'wp-yuanqi-tech', '元启·技术白皮书', 'unpublished', '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z');--> statement-breakpoint
INSERT INTO "download_resource_revisions" ("id", "resource_id", "name", "product", "category", "resource_type", "description", "sort_order", "preview_policy", "download_policy", "created_at") VALUES
	('019faaaa-0000-7000-9000-000000000001', '019faaaa-0000-7000-8000-000000000001', '元启·全栈解决方案', '元启', 'materials', '解决方案', '面向企业管理层的元启平台全栈解决方案，涵盖算力、模型、平台与智能体应用全景。', 10, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000002', '019faaaa-0000-7000-8000-000000000002', '元启·开发一体机彩页', '元启', 'materials', '彩页', '元启 AI 开发平台一体机产品彩页，介绍一体机形态、核心能力与适用场景。', 20, 'public', 'public', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000003', '019faaaa-0000-7000-8000-000000000003', '元启·案例集与场景汇总', '元启', 'materials', '案例集', '覆盖政务、金融、能源等行业落地案例与典型应用场景汇总。', 30, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000004', '019faaaa-0000-7000-8000-000000000004', '元启·三折叠彩页', '元启', 'materials', '彩页', '元启平台产品总览彩页，一页了解平台定位与核心价值。', 40, 'public', 'public', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000005', '019faaaa-0000-7000-8000-000000000005', '元启·用户使用手册', '元启', 'materials', '用户手册', '元启平台用户使用手册，介绍平台各中心功能与使用流程。', 50, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000006', '019faaaa-0000-7000-8000-000000000006', '码里奥·产品说明书', '码里奥', 'materials', '产品说明书', '码里奥（AI 代码生成助手）产品说明书，介绍产品定位、核心能力与使用方式。', 60, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000007', '019faaaa-0000-7000-8000-000000000007', '码里奥·智能编码解决方案', '码里奥', 'materials', '解决方案', '面向研发团队的智能编码解决方案，融合技能开发、Agent 管理与 AI 编程。', 70, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000008', '019faaaa-0000-7000-8000-000000000008', '办公·一体机彩页', '智能办公', 'materials', '彩页', '智能办公一体机产品彩页，聚焦公文写作、会议纪要等办公场景提效。', 80, 'public', 'public', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000009', '019faaaa-0000-7000-8000-000000000009', '办公·公文写作助手说明书', '智能办公', 'materials', '产品说明书', '公文写作助手产品说明，支持公文拟稿、润色与格式规范。', 90, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000010', '019faaaa-0000-7000-8000-000000000010', '办公·合同审核助手说明书', '智能办公', 'materials', '产品说明书', '合同审核助手产品说明，辅助合同条款核对与风险识别。', 100, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000011', '019faaaa-0000-7000-8000-000000000011', '办公·招投标智能体说明书', '智能办公', 'materials', '产品说明书', '招投标智能体产品说明，覆盖标书撰写、审查与投标流程提效。', 110, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000012', '019faaaa-0000-7000-8000-000000000012', '导办·一体机彩页', '智能导办', 'materials', '彩页', '智能导办一体机产品彩页，面向政务服务场景的智能导办入口。', 120, 'public', 'public', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000013', '019faaaa-0000-7000-8000-000000000013', '导办·政务智能体产品介绍', '智能导办', 'materials', '产品介绍', '面向政务服务领域的智能体产品介绍，覆盖事项导办、材料核验等场景。', 130, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000014', '019faaaa-0000-7000-8000-000000000014', '导办·智能导办助手说明书', '智能导办', 'materials', '产品说明书', '智能导办助手产品说明，通过意图识别辅助完成业务办理。', 140, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000015', '019faaaa-0000-7000-8000-000000000015', '视觉·一体机三折页', '视觉检索智能体', 'materials', '彩页', '视觉检索一体机产品三折页，介绍视频接入、检索与布控能力。', 150, 'public', 'public', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000016', '019faaaa-0000-7000-8000-000000000016', '视觉·视频智能体解决方案', '视觉检索智能体', 'materials', '解决方案', '视频大模型智能体解决方案，从“看得见”到“看得懂、能处置”。', 160, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000018', '019faaaa-0000-7000-8000-000000000018', '视觉·用户使用手册', '视觉检索智能体', 'materials', '用户手册', '视觉检索智能体使用说明，覆盖功能操作与布控配置。', 180, 'public', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000020', '019faaaa-0000-7000-8000-000000000020', '元启·部署安装操作手册', '元启', 'deployment', '部署手册', '元启平台部署安装操作手册，覆盖环境准备、安装部署与初始化验证。', 10, 'contact', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000021', '019faaaa-0000-7000-8000-000000000021', '元启·部署安装 FAQ', '元启', 'deployment', 'FAQ', '元启平台部署安装常见问题解答，帮助快速完成部署与排障。', 20, 'contact', 'contact', '2026-08-16T00:00:00.000Z'),
	('019faaaa-0000-7000-9000-000000000022', '019faaaa-0000-7000-8000-000000000022', '元启·技术白皮书', '元启', 'whitepapers', '技术白皮书', '元启 AI 开发赋能平台技术白皮书，介绍平台架构、关键技术与企业落地路径。', 10, 'contact', 'contact', '2026-08-16T00:00:00.000Z');--> statement-breakpoint
UPDATE "download_resources" resource
SET "draft_revision_id" = revision.id
FROM "download_resource_revisions" revision
WHERE revision.resource_id = resource.id;
