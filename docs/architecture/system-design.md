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
       -> Internal AgentOS (Bearer-authenticated, model-free placeholder)
  -> PostgreSQL
```

## 模块边界

- Portal：公开页面、产品、版本、博客、案例、兼容矩阵。
- Docs：基于 Nextra 的仓库内 MDX 文档，不把 Nextra 当作 CMS。
- Identity：管理员创建账号、登录、会话、基础 RBAC。
- CMS：管理导航、页面配置、产品、版本、博客、案例、FAQ 等站内内容。
- Console：登录后统一外壳；依赖外部系统的区域展示未开放状态。
- Integrations：License、Download、OpenLab 等提供稳定接口，默认关闭。
- AgentOS：独立 Python 服务；当前只提供受保护的占位能力与健康检查，不加载模型、Skill、知识库或工作流。

## 数据原则

- PostgreSQL 独立容器和独立持久化卷。
- 平台数据位于`public`/`drizzle`，AgentOS数据位于`agno`；跨 schema 默认拒绝。
- Schema 变更只通过平台`migrate`或 AgentOS`agent-migrate`执行，运行时服务没有 DDL 权限。
- 生产部署前自动备份，至少每日一次，并保留异机副本。
- 同一 custom-format dump 覆盖`public`、`drizzle`、`agno`，恢复演练只验证结构、版本和非敏感计数，不读取消息正文。
- API 与页面只通过服务层访问数据，不直接散落数据库调用。

## 容器启动边界

固定顺序为：`db → migrate → agno-bootstrap → agent-migrate → agent → web → proxy/backup`。`agno-bootstrap`是新卷和既有卷共用的幂等角色/schema升级入口；`backup`等待平台与 AgentOS 迁移全部完成。

## 一期不做

- License 生成、加密、激活、续期和机器绑定逻辑。
- 安装包存储、下载鉴权、CDN、断点续传。
- OpenLab 认证、审批和真实授权下发。
- 支付、发票、CRM、短信、企业 SSO 等外部系统。
- Kubernetes、多实例缓存协调和微服务拆分。
