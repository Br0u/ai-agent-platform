INSERT INTO "content_revisions" (
  "id", "content_id", "revision", "slug", "title", "summary", "body", "created_by", "created_at"
)
SELECT
  '019f79c8-9a00-7000-9000-000000000104'::uuid,
  c."id",
  2,
  c."slug",
  c."title",
  c."summary",
  $body${"format":"safe-markdown-v1","source":"## 日常检查\n\n- 查看 Web、数据库和模型网关的健康状态。\n- 检查管理员操作审计和异常登录记录。\n- 观察请求延迟、错误率、队列积压和磁盘使用量。\n- 定期验证备份可恢复，而不是只验证备份任务成功。\n\n## 故障处理顺序\n\n1. 记录发生时间、影响范围和最近一次发布。\n2. 先确认健康接口、容器日志和数据库连接。\n3. 对外部模型或资源依赖使用降级或占位策略。\n4. 恢复服务后补齐事件记录和复盘结论。\n\n:::callout{type=\"warning\"}\n生产环境排障时不要直接删除容器或数据库数据；先保留日志和现场，再执行可回滚操作。\n:::\n\n:::cards\n- [环境兼容矩阵](/downloads#dl-mdd2-env)\n- [支持与工单](/support)\n:::\n","checksum":"83a4f710414e8bd1801e99e9dde25f918c35db833f6bbc655f75b85a3bc3c9e9","navigation":{"label":"运维手册","code":"OPERATIONS","position":40},"renderModel":{"version":1,"root":{"type":"root","children":[{"type":"element","tagName":"h2","properties":{"id":"doc-content-日常检查"},"children":[{"type":"text","value":"日常检查"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"ul","properties":{},"children":[{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"查看 Web、数据库和模型网关的健康状态。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"检查管理员操作审计和异常登录记录。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"观察请求延迟、错误率、队列积压和磁盘使用量。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"定期验证备份可恢复，而不是只验证备份任务成功。"}]},{"type":"text","value":"\n"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"h2","properties":{"id":"doc-content-故障处理顺序"},"children":[{"type":"text","value":"故障处理顺序"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"ol","properties":{},"children":[{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"记录发生时间、影响范围和最近一次发布。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"先确认健康接口、容器日志和数据库连接。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"对外部模型或资源依赖使用降级或占位策略。"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"text","value":"恢复服务后补齐事件记录和复盘结论。"}]},{"type":"text","value":"\n"}]},{"type":"text","value":"\n"},{"type":"element","tagName":"document-callout","properties":{"dataCalloutType":"warning"},"children":[{"type":"element","tagName":"p","properties":{},"children":[{"type":"text","value":"生产环境排障时不要直接删除容器或数据库数据；先保留日志和现场，再执行可回滚操作。"}]}]},{"type":"text","value":"\n"},{"type":"element","tagName":"document-cards","properties":{},"children":[{"type":"element","tagName":"ul","properties":{},"children":[{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"element","tagName":"a","properties":{"href":"/downloads#dl-mdd2-env"},"children":[{"type":"text","value":"环境兼容矩阵"}]}]},{"type":"text","value":"\n"},{"type":"element","tagName":"li","properties":{},"children":[{"type":"element","tagName":"a","properties":{"href":"/support"},"children":[{"type":"text","value":"支持与工单"}]}]},{"type":"text","value":"\n"}]}]}]},"toc":[{"id":"doc-content-日常检查","title":"日常检查","depth":2},{"id":"doc-content-故障处理顺序","title":"故障处理顺序","depth":2}]}}$body$::jsonb,
  NULL,
  '2026-08-12T00:00:00.000Z'::timestamptz
FROM "content" c
WHERE c."id" = '019f79c8-9a00-7000-8000-000000000004'::uuid
  AND c."type" = 'document'
  AND c."slug" = 'operations'
  AND c."revision" = 1
  AND c."row_version" = 1
  AND c."published_revision" = 1
  AND c."body"->>'checksum' = '4142998b2dad762895a6913d69bf4b86f53a5761ab832b18846d6570ad9e5053';
--> statement-breakpoint
UPDATE "content" c
SET
  "body" = cr."body",
  "revision" = 2,
  "row_version" = 2,
  "published_revision" = 2,
  "updated_at" = '2026-08-12T00:00:00.000Z'::timestamptz
FROM "content_revisions" cr
WHERE c."id" = '019f79c8-9a00-7000-8000-000000000004'::uuid
  AND c."revision" = 1
  AND c."row_version" = 1
  AND c."published_revision" = 1
  AND c."body"->>'checksum' = '4142998b2dad762895a6913d69bf4b86f53a5761ab832b18846d6570ad9e5053'
  AND cr."id" = '019f79c8-9a00-7000-9000-000000000104'::uuid
  AND cr."content_id" = c."id"
  AND cr."revision" = 2;
