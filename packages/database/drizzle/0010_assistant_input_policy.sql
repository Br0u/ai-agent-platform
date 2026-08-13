CREATE TABLE "assistant_input_policy" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_input_policy_id_singleton_check" CHECK ("assistant_input_policy"."id" = 1),
	CONSTRAINT "assistant_input_policy_revision_positive_check" CHECK ("assistant_input_policy"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "assistant_input_policy" ADD CONSTRAINT "assistant_input_policy_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;