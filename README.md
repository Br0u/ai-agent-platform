# AI Agent Platform Customer Portal

企业级 AI Agent Platform 客户门户。当前已完成全站页面、基础后台、自建数据库、Docker 部署，以及“码多多”单 Agent 与六家云模型动态配置闭环；License、下载、OpenLab、Skill、Knowledge、网页工具和本地算力等尚未接入能力只保留诚实入口或接口契约。

## 目录

```text
apps/web/                 Next.js 全站应用
apps/agent/               内部 AgentOS Python 服务
packages/ui/              共享设计系统与组件
packages/database/        PostgreSQL Schema、迁移与种子数据
packages/integrations/    外部能力适配器与 Mock
infra/docker/             数据库备份脚本
infra/nginx/              反向代理配置
docs/product/             PRD 与原始需求归档
docs/architecture/        系统架构说明
docs/api/                 接口契约
docs/design/              品牌规范与 UI 方向稿
docs/deployment/          服务器准备和上线检查
apps/web/public/          Logo、产品截图等正式素材（当前为空）
```

## 当前文档

- 产品主版本：`docs/product/PRD.md`
- 系统设计：`docs/architecture/system-design.md`
- 占位接口：`docs/api/integration-contracts.md`
- UI 方向：`docs/design/AI Agent Platform - UI Directions.html`
- 服务器准备：`docs/deployment/server-readiness.md`
- 码多多运行时验收：`docs/testing/assistant-runtime-acceptance.md`
- 真实 Provider 冒烟：`docs/testing/model-provider-smoke.md`

## 本地运行

```bash
pnpm install
pnpm dev
```

## Docker运行

```bash
cp .env.example .env
# 编辑.env并替换测试密码
# 按 .env.example 创建所有独立的 0600 单行 Secret；不要复用数据库、认证、控制面或模型加密密钥
pnpm secrets:preflight
docker compose build migrate agent-migrate agent-control-migrate agent web backup
docker compose up -d --wait db
docker compose run --rm migrate
docker compose run --rm agno-bootstrap
docker compose run --rm agent-control-bootstrap
docker compose run --rm --no-deps agent-migrate
docker compose run --rm --no-deps agent-control-migrate
docker compose up -d --no-deps --wait agent
docker compose up -d --wait web
docker compose up -d --wait proxy backup
```

访问 `http://localhost:8080`；健康检查为 `/api/health/live` 和 `/api/health/ready`。启用动态模型控制时设置 `AGENT_ENABLED=true`、`ASSISTANT_PROVIDER_MODE=agentos`，然后由最近完成 MFA 的授权管理员在 `/admin/assistant` 保存、测试并启用模型。

## 当前状态

已建立全站路由、蓝靛紫设计系统、PostgreSQL 最小权限角色、AgentOS 单 Agent 会话、AES-GCM 动态模型控制面和 Docker Compose 部署/验收基线。后台支持 OpenAI、Anthropic、Google、Qwen / DashScope、DeepSeek、MiniMax；动态活动配置优先于只读部署 bootstrap，失败候选不会替换旧活动模型，重启会从活动指针恢复。

Skill、Knowledge、Tools/网页操作和自有服务器本地算力目前仍是未接入入口，不会加载能力或探测本地服务。实现边界参考 Agno 文档，但运行行为以仓库锁定的 Agno `2.7.2` 和本地测试为准。
