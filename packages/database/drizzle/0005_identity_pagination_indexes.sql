CREATE INDEX "audit_logs_created_id_desc_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);
