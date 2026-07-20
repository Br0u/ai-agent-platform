# CMS 文档迁移与回滚手册

本手册只覆盖 Nextra 文档迁移到 CMS 的上线边界。仓库内的 MDX 在 Phase 2/3 完成前保留为上一 Web 镜像的回滚载荷；数据库迁移是向前兼容的，不执行破坏性回退。

## 上线前硬门禁

1. 在部署证据系统中记录当前 Web 镜像 digest、发布负责人和新鲜数据库备份 ID，并实际验证备份可读取。
2. 运行 `pnpm --filter @ai-agent-platform/document-content seed:check`，确认生成的 `0007_cms_document_seed.sql` 与 `DOCUMENT_SEED_MANIFEST` 一致。
3. 在隔离环境运行 `bash docs/testing/run-cms-documents-e2e.sh`。只有清理完成后输出 `CMS documents E2E passed.` 才算通过。
4. 校验数据库恰有 7 篇 `content` 文档、7 个 revision-1 `content_revisions`、7 个 canonical `content_routes`，alias 和 reserved 均为 0；每篇已发布 revision 的 source/renderModel 组合 checksum 必须等于 `DOCUMENT_SEED_MANIFEST`。
5. 下列九项目标环境合同必须全部填写并由发布负责人批准。任一项缺失即停止，不得把开发机或本地 Compose 当成目标环境。

| 目标环境合同             | 已批准值 |
| ------------------------ | -------- |
| 目标环境                 | 待提供   |
| 公开 origin              | 待提供   |
| 镜像 registry/repository | 待提供   |
| Phase 2 digest           | 待提供   |
| Phase 3 digest           | 待提供   |
| 备份命令                 | 待提供   |
| 部署命令                 | 待提供   |
| 回滚命令                 | 待提供   |
| 证据存储位置             | 待提供   |

## Phase 2：先迁移，公开页仍读 MDX

严格执行以下顺序，migration/backfill 必须先于 Web 镜像：

1. 执行已批准的备份命令，记录备份 ID、开始/结束时间和结果。
2. 运行全部 migration/backfill、权限 seed 和 runtime grant。失败时停止，不切换 Web。
3. 执行七篇文档、七个 revision-1、七个 canonical route、零 alias/reserved 和 manifest checksum 校验。
4. 部署 Phase 2 digest。该镜像开放 `/admin/docs`，但公开 `/docs` 仍读取打包 MDX。
5. 完成 CMS 生命周期 smoke：创建、保存、预览、发布；确认新数据库发布不会改变公开 MDX 页面。
6. 连续观察至少 60 分钟，要求 CMS/公开页零 5xx、零 Web/数据库重启、零文档读取告警。

Phase 2 失败时恢复记录的上一 Web 镜像，且不回滚数据库。新表、CMS 写入和已完成的 migration 保留，修复应用后再切换。

## Phase 3：公开页切换到数据库发布版本

1. 部署 Phase 3 digest，确认真实公开 origin 的 `/docs` 和七个 canonical URL 均读取不可变 published revision。
2. 重做 CMS 生命周期 smoke，并验证改名后的旧 slug 发生 alias 永久重定向、archive 后 canonical URL 返回 404、重新发布后恢复 200。
3. 执行一次应用回滚演练：恢复 Phase 2 digest，不回滚数据库；确认七篇打包 MDX 正常后重新部署 Phase 3 digest，并重复数据库和公开检查。
4. 重新切换后连续观察至少 24 小时，每分钟检查 `/docs` 与七个 canonical URL。要求零 5xx、零 checksum/内容不一致、零意外重定向、零 Web/数据库重启、零文档读取告警。
5. 在证据存储位置保留三份镜像 digest、备份 ID、时间戳检查、Phase 2 证据、Phase 3 回滚/重部署结果、观察起止时间和发布负责人批准。

## 回滚原则

- migration 失败：不部署新 Web，修复数据库迁移后重试。
- Web 或 smoke 失败：恢复上一 Web 镜像，不回滚数据库。
- 禁止删除新表、published revision、route 或 CMS 写入；禁止执行破坏性数据库回滚。
- 只有隔离 E2E、Phase 2、Phase 3 回滚演练、24 小时观察和发布负责人批准全部通过，才允许删除仓库 MDX 回滚载荷。
