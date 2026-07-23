# 系统设计基线

## 架构选择

一期采用模块化单体，不拆微服务：

```text
Browser
  -> Nginx/Caddy
  -> Next.js App Router
       -> Portal / Docs / Console / CMS
       -> Route Handlers / Server Actions
       -> Domain Services
       -> Integration Adapters
       -> Internal AgentOS (Bearer-authenticated single Agent)
       -> Internal Skill Registry (signed control requests)
  -> PostgreSQL
```

## 模块边界

- Portal：公开页面、产品、版本、博客、案例、兼容矩阵。
- Docs：基于 Nextra 的仓库内 MDX 文档，不把 Nextra 当作 CMS。
- Identity：管理员创建账号、登录、会话、基础 RBAC。
- CMS：管理导航、页面配置、产品、版本、博客、案例、FAQ 等站内内容。
- Console：登录后统一外壳；依赖外部系统的区域展示未开放状态。
- Integrations：License、Download、OpenLab 等提供稳定接口，默认关闭。
- AgentOS：独立 Python 服务；提供码多多单 Agent、动态模型配置，并按已激活集合加载审核通过的 exact Skill revision；知识库与工作流尚未接入。
- Skill Registry：独立 Python 服务；保存本地 ZIP、不可变 revision、校验与审核证据，并向 Agent 提供已激活集合及受签名保护的 artifact 读取接口。

### Skill 运行边界

- Agent 只物化 Registry 已激活集合中的 exact published revision；物化、Agno 校验和脚本执行都移出 Agent 异步事件循环，超时后的晚到 generation 必须清理后才能重试。
- Skill 指令、引用和脚本读取每次最多返回 12,000 字符并通过 `next_offset` 续页；单次脚本执行最长 30 秒，参数最多 16 个且单项最多 1,024 字符，stdout/stderr 合计最多保留 12,000 字符。
- 单次 Agent run 最多 8 次工具调用，历史上下文最多带回 2 次工具调用；公开 SSE 显式关闭 Agno 内部事件流，只转发文本增量和完成事件。原始 SSE 最多 4 MiB，最终正文仍最多 32,768 个 Unicode code point。Web/Agent 间 55 秒为无数据空闲超时，每个上游 chunk 会续期。
- 审核是当前脚本执行的信任边界；脚本仍在 Agent 容器的系统权限和网络边界内运行，不等价于独立 OS 沙箱。需要接入来源不完全可信的第三方 Skill 时，必须先增加独立执行容器或同等级隔离。

## 数据原则

- PostgreSQL 独立容器和独立持久化卷。
- 平台数据位于`public`/`drizzle`，AgentOS 数据位于`agno`，动态模型控制位于`agent_control`，长期 Skill 证据位于`skill_registry`；跨 schema 默认拒绝。
- Schema 变更只通过各自的 migrate 服务执行，运行时服务没有 DDL 权限。
- 生产部署前自动备份，至少每日一次，并保留异机副本。
- 同一 snapshot 的加密 bundle 覆盖`public`、`drizzle`、`agno`、`skill_registry`，并验证 manifest、制品 SHA-256、结构、版本和非敏感计数；短生命周期`agent_control`不进入备份。
- API 与页面只通过服务层访问数据，不直接散落数据库调用。

## 容器启动边界

固定顺序为：`db → migrate / agno-bootstrap → agent-migrate / agent-control-bootstrap / skill-registry-bootstrap → agent-control-migrate / skill-registry-migrate → agent / skill-registry → web → proxy/backup`。各 bootstrap 是新卷和既有卷共用的幂等角色入口；`backup`等待平台、AgentOS 与 Skill Registry 迁移全部完成。

## 一期不做

- License 生成、加密、激活、续期和机器绑定逻辑。
- 安装包存储、下载鉴权、CDN、断点续传。
- OpenLab 认证、审批和真实授权下发。
- 支付、发票、CRM、短信、企业 SSO 等外部系统。
- Kubernetes、多实例缓存协调和微服务拆分。
