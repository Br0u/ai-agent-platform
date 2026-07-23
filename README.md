# AI Agent Platform Customer Portal

企业级 AI Agent Platform 客户门户。当前已完成全站页面、基础后台、自建数据库、Docker 部署、“码多多”单 Agent 与六家云模型动态配置闭环，以及审核过的 Skill 从 ZIP 上传、不可变 revision、双人审核、集合激活到 Agent 加载和加密备份恢复的闭环；License、下载、OpenLab、Knowledge、网页工具和本地算力等尚未接入能力只保留诚实入口或接口契约。

## 目录

```text
apps/web/                 Next.js 全站应用
apps/agent/               内部 AgentOS Python 服务
apps/skill-registry/      内部 Skill 库、校验与审核服务
packages/ui/              共享设计系统与组件
packages/database/        PostgreSQL Schema、迁移与种子数据
packages/skill-core/      Skill archive、manifest 与静态安全校验
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

## 本地开发（直接运行 Web，端口 3000）

需要 Node.js 24、pnpm 11，以及已经配置好的本地数据库和应用环境变量。该方式不会自动启动 PostgreSQL、AgentOS、Nginx 或备份服务。

```bash
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:3000`。直接开发模式的 Origin 必须使用端口 `3000`，并保持 `TRUST_NGINX_PROXY=false`。

## 本地 Docker Compose（完整环境，端口 8080）

需要 Docker Engine / Docker Desktop，以及 Docker Compose 2.33.1 或更新版本。`.env.example` 是生产模板；复制后除替换所有占位密码外，本地 Compose 必须把公开地址改为代理端口 `8080`：

```bash
cp .env.example .env
# 编辑 .env：替换全部 replace-with-* 占位值，并设置以下本地值：
# BETTER_AUTH_URL=http://127.0.0.1:8080
# BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080
# ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080
# PUBLIC_HOST=127.0.0.1
# ALLOW_LOCAL_VALIDATION_HOSTS=true
# AGENT_ENABLED=true
# ASSISTANT_PROVIDER_MODE=agentos
# 按 .env.example 创建全部独立的 0600 单行 Secret；不要复用数据库、认证、控制面或模型加密密钥
docker compose config --quiet
pnpm secrets:preflight
docker compose build migrate agent-migrate agent-control-migrate skill-registry-migrate agent skill-registry web backup
docker compose up -d --wait db
docker compose run --rm migrate
docker compose run --rm agno-bootstrap
docker compose run --rm agent-control-bootstrap
docker compose run --rm skill-registry-bootstrap
docker compose run --rm --no-deps agent-migrate
docker compose run --rm --no-deps agent-control-migrate
docker compose run --rm --no-deps skill-registry-migrate
docker compose up -d --no-deps --wait agent skill-registry
docker compose up -d --wait web
docker compose up -d --wait proxy backup
```

生产启动顺序固定为：`db → migrate / agno-bootstrap → agent-migrate / agent-control-bootstrap / skill-registry-bootstrap → agent-control-migrate / skill-registry-migrate → agent / skill-registry → web → proxy/backup`。

访问 `http://127.0.0.1:8080`。验收：

```bash
docker compose ps
curl -f -H 'Host: 127.0.0.1' http://127.0.0.1:8080/api/health/live
curl -f -H 'Host: 127.0.0.1' http://127.0.0.1:8080/api/health/ready
```

系统不创建默认管理员。首次部署使用交互命令创建超级管理员：

```bash
docker compose run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

启用动态模型控制后，由最近完成 MFA 的授权管理员在 `/admin/assistant` 保存、测试并启用模型。纯动态控制部署不需要在 `.env` 中配置 Provider、Model ID 或模型 API Key。

## 交给 Agent 的本地 Docker 部署 Prompt

同事可以让 Agent 直接访问完整仓库，并使用下面的 Prompt。不要只复制其中的命令，Agent 必须先读取当前文件：

```text
请在当前仓库创建并启动一个全新的本地 Docker Compose 开发环境。

开始前必须读取并交叉检查：
- README.md
- .env.example
- compose.yaml
- infra/docker/README.md

约束：
1. 不修改任何 Git 已跟踪的业务代码或产品文档。
2. 如果 .env、.secrets 或同名 Compose 项目已经存在，先检查并报告，不得覆盖。
3. 不得执行 docker compose down -v、docker volume rm、rm -rf 或其他删除现有数据的命令。
4. 创建相互独立的 0600 单行 Secret；数据库 URL 中的密码必须与对应密码文件一致。
5. 不得在回复、日志、命令参数或 docker compose config 输出中显示任何 Secret 值。
6. 本地 Compose 必须统一使用 http://127.0.0.1:8080：
   - BETTER_AUTH_URL=http://127.0.0.1:8080
   - BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080
   - ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080
   - PUBLIC_HOST=127.0.0.1
   - ALLOW_LOCAL_VALIDATION_HOSTS=true
   - AGENT_ENABLED=true
   - ASSISTANT_PROVIDER_MODE=agentos
7. 先运行 docker compose config --quiet；失败时停止，不得继续启动。
8. 严格执行 README 当前 Docker Compose 顺序，不能遗漏 agent-control-bootstrap 或 agent-control-migrate，也不能遗漏 skill-registry-bootstrap 或 skill-registry-migrate。
9. 不配置部署 bootstrap Provider Key；模型由管理员启动后在 /admin/assistant 配置。
10. 最后必须检查 docker compose ps，并验证 /api/health/live 和 /api/health/ready。
11. 只报告做了什么、如何验证、仍需人工完成什么；不得把“容器启动”冒充成“模型已经可用”。
```

服务器生产部署还必须补充真实 HTTPS 域名、外部 Secret 路径、异机备份和监控，参见 `docs/deployment/server-readiness.md`；不要直接复用上面的本地 Prompt。

## 当前状态

已建立全站路由、蓝靛紫设计系统、PostgreSQL 最小权限角色、AgentOS 单 Agent 会话、AES-GCM 动态模型控制面和 Docker Compose 部署/验收基线。后台支持 OpenAI、Anthropic、Google、Qwen / DashScope、DeepSeek、MiniMax；动态活动配置优先于只读部署 bootstrap，失败候选不会替换旧活动模型，重启会从活动指针恢复。Skill 库、审核与运行时闭环已接入：授权管理员上传本地 ZIP，经具备审核权限的账号审核发布 exact revision，再组成不可变集合供码多多激活、回滚和重启恢复；artifact 与运行时指针纳入加密备份恢复。

码多多现在只加载 Registry 中已发布且由授权管理员显式激活的 exact revision；Agent 使用只读 runtime 数据库角色，在 96 MiB `/run/aap-skills` tmpfs 中重新校验和物化，并按 run 固定 generation。GitHub/GitLab/GitCode 导入和脚本级强沙箱仍属于下一阶段。Knowledge、Tools/网页操作和自有服务器本地算力仍是未接入入口。运行行为以仓库锁定的 Agno `2.7.2` 和本地测试为准。
