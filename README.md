# AI Agent Platform Customer Portal

企业级 AI Agent Platform 客户门户。当前阶段先完成全站页面、基础后台、自建数据库与 Docker 部署能力；License、下载、OpenLab 及其他外部系统仅保留页面和接口契约。

## 目录

```text
apps/web/                 Next.js 全站应用
packages/ui/              共享设计系统与组件
packages/database/        PostgreSQL Schema、迁移与种子数据
packages/integrations/    外部能力适配器与 Mock
infra/docker/             Docker Compose 与镜像构建
infra/nginx/              反向代理和 HTTPS 配置
docs/product/             PRD 与原始需求归档
docs/architecture/        系统架构说明
docs/api/                 接口契约
docs/design/              品牌规范与 UI 方向稿
docs/deployment/          服务器准备和上线检查
public/assets/            Logo、产品截图等正式素材
```

## 当前文档

- 产品主版本：`docs/product/PRD.md`
- 系统设计：`docs/architecture/system-design.md`
- 占位接口：`docs/api/integration-contracts.md`
- UI 方向：`docs/design/AI Agent Platform - UI Directions.html`
- 服务器准备：`docs/deployment/server-readiness.md`

## 当前状态

项目尚未初始化代码和 Git 仓库。应先确认 PRD、UI 方向和公司服务器环境，再进入实现计划。
