# 码多多环境迁移配置清单

本文只记录配置名称、约束和迁移顺序。真实 Key、数据库密码和 Provider Key 不得写入 Git、日志、截图或工单。

## 1. 启用开关与内部地址

| 配置                        | 生产建议值                      | 说明                                                                      |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `AGENT_ENABLED`             | `true`                          | 注册固定 `maduoduo` Agent，并启用动态模型控制面                           |
| `ASSISTANT_PROVIDER_MODE`   | `agentos`                       | Web 实际调用 AgentOS；`placeholder` 只返回安全占位回答                    |
| `AGENTOS_INTERNAL_URL`      | `http://agent:7777`             | Web 到 Agent 的内部精确 origin；不能带路径、尾斜杠、账号、查询或 fragment |
| `MODEL_RUN_TIMEOUT_SECONDS` | `50`                            | Agent 调用模型超时，允许 1～50 秒                                         |
| `MODEL_ENDPOINTS_FILE`      | `/etc/aap/model-endpoints.json` | Agent 读取受控 Endpoint catalog；Compose 已内置，不交给浏览器             |

本地开发使用 `AGENTOS_INTERNAL_URL=http://127.0.0.1:7777`。生产不得把 7777 发布到公网。

## 2. Web 运行时与熔断参数

这些变量不是密钥，但当前 Web 运行时要求完整配置：

```dotenv
ASSISTANT_AGENTOS_RUN_TIMEOUT_MS=55000
ASSISTANT_AGENTOS_READINESS_TTL_MS=5000
ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS=1500
ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD=3
ASSISTANT_AGENTOS_CIRCUIT_RESET_MS=30000
```

缺少 readiness 参数时，控制面仍可能可用，但聊天运行时会安全降级为 `degraded`。

## 3. Origin、认证与代理

生产必须使用实际对外 HTTPS origin：

```dotenv
BETTER_AUTH_URL=https://ai-agent.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://ai-agent.example.com
ASSISTANT_PUBLIC_ORIGIN=https://ai-agent.example.com
TRUST_NGINX_PROXY=true
```

本地同时使用两个地址时：

```dotenv
BETTER_AUTH_URL=http://127.0.0.1:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:3000
TRUST_NGINX_PROXY=false
```

要求：

- origin 必须精确匹配，不能带尾斜杠或路径。
- 浏览器实际访问的 origin 必须出现在 `BETTER_AUTH_TRUSTED_ORIGINS` 中。
- 只有 Web 只能从受控 Nginx 访问且 Nginx 覆盖转发头时，才设置 `TRUST_NGINX_PROXY=true`。

## 4. 独立密钥

| Secret                        | 挂载范围    | 约束                                                                        |
| ----------------------------- | ----------- | --------------------------------------------------------------------------- |
| `OS_SECURITY_KEY`             | Web + Agent | AgentOS Bearer Key，至少 32 UTF-8 bytes，符合 Bearer token 字符集           |
| `AGENT_CONFIG_CONTROL_KEY`    | Web + Agent | 动态配置控制 Bearer Key，至少 32 UTF-8 bytes，必须与 `OS_SECURITY_KEY` 不同 |
| `MODEL_CONFIG_ENCRYPTION_KEY` | 仅 Agent    | 64 个小写十六进制字符，即 32 bytes AES-256-GCM 主密钥                       |
| `BETTER_AUTH_SECRET`          | 仅 Web      | 至少 32 字符，不得复用其他 Key                                              |
| `ASSISTANT_SESSION_SECRET`    | 仅 Web      | 独立随机值，至少 32 bytes                                                   |
| `ASSISTANT_RATE_LIMIT_SECRET` | 仅 Web      | 独立随机值，至少 32 bytes                                                   |

建议生成：

```bash
umask 077
openssl rand -hex 32 > .secrets/os_security_key
openssl rand -hex 32 > .secrets/agent_config_control_key
openssl rand -hex 32 > .secrets/model_config_encryption_key
chmod 600 .secrets/os_security_key .secrets/agent_config_control_key .secrets/model_config_encryption_key
```

三个文件必须分别生成。`MODEL_CONFIG_ENCRYPTION_KEY` 迁移时必须保留原值，否则数据库中已保存的模型 Key 无法解密。

Compose 使用以下文件变量：

```dotenv
OS_SECURITY_KEY_FILE=.secrets/os_security_key
AGENT_CONFIG_CONTROL_KEY_FILE=.secrets/agent_config_control_key
MODEL_CONFIG_ENCRYPTION_KEY_FILE=.secrets/model_config_encryption_key
BETTER_AUTH_SECRET_FILE=.secrets/better_auth_secret
ASSISTANT_SESSION_SECRET_FILE=.secrets/assistant_session_secret
ASSISTANT_RATE_LIMIT_SECRET_FILE=.secrets/assistant_rate_limit_secret
```

## 5. 动态模型控制数据库

动态配置使用独立 migrator/runtime 角色，不复用 Agno 或 Web 数据库账号：

```dotenv
AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE=.secrets/agent_control_migrator_database_password
AGENT_CONTROL_DATABASE_PASSWORD_FILE=.secrets/agent_control_database_password
AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE=.secrets/agent_control_migrator_database_url
AGENT_CONTROL_DATABASE_URL_FILE=.secrets/agent_control_database_url
```

URL 使用 `postgresql+psycopg_async://`，示例角色分别为：

- `ai_agent_control_migrator`：只用于一次性 schema 迁移。
- `ai_agent_control`：Agent 运行时读写模型配置、活动指针和控制事件，无 schema 变更权限。

仍需保留原有：

- `AGNO_MIGRATOR_DATABASE_URL_FILE`、`AGNO_DATABASE_URL_FILE`：Agno 会话库。
- `MIGRATOR_DATABASE_URL_FILE`、`RUNTIME_DATABASE_URL_FILE`：平台迁移与 Web 运行时。
- 对应独立数据库密码文件。

## 6. Provider Key 与 bootstrap 模型

后台保存的 Provider Key 不写入环境变量，而是经 `/admin/assistant` 写入数据库并用 `MODEL_CONFIG_ENCRYPTION_KEY` 加密。

以下变量只用于可选的部署 bootstrap 模型：

```dotenv
MODEL_PROVIDER=
MODEL_ID=
MODEL_BASE_URL=
MODEL_API_KEY_FILE=.secrets/model_api_key
```

规则：

- `MODEL_PROVIDER`、`MODEL_ID`、`MODEL_API_KEY` 必须全部提供或全部省略。
- 支持 `openai`、`anthropic`、`google`、`dashscope`、`deepseek`、`minimax`。
- 数据库中存在动态活动配置时，动态配置优先。
- 动态配置加载失败时 fail closed，不静默回退 bootstrap。
- 未来本地模型仓库不能伪装成上述云 Provider；必须增加正式本地 Provider 和受控内网 Endpoint。

## 7. 权限与首次数据准备

迁移后必须执行平台 migration 和 access-control seed，确保角色包含：

- `admin:assistant`：访问助手管理与测试控制台。
- `admin:assistant:configure`：保存、测试并启用模型配置。
- `admin:assistant:secret:reveal`：查看已保存 Key；仍要求近期密码再认证与 TOTP。

没有默认管理员。首次部署需通过交互命令创建超级管理员：

```bash
docker compose run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

## 8. 推荐迁移顺序

1. 复制数据库卷/备份，并原样迁移 `MODEL_CONFIG_ENCRYPTION_KEY`。
2. 创建全部独立 Secret 文件并设置 `0600` 权限。
3. 配置公网 origin、内部 AgentOS 地址和 readiness 参数。
4. 启动 PostgreSQL，执行平台 `migrate` 与 access-control seed。
5. 执行 `agno-bootstrap`、`agent-migrate`。
6. 执行 `agent-control-bootstrap`、`agent-control-migrate`。
7. 启动 `agent`，确认 `/internal/health/ready` 为 `available` 或尚未配置模型时为 `placeholder`。
8. 启动 `web`、`proxy`、`backup`。
9. 登录 `/admin/assistant`，确认控制面已启用、已有配置可解密、活动版本与运行版本一致。
10. 用一个批准的真实模型执行“测试并启用”和一次临时对话；不要把 Key 或返回中的敏感内容写入迁移记录。

## 9. 验收命令

```bash
docker compose config
docker compose ps
curl -f -H "Host: ${PUBLIC_HOST}" http://127.0.0.1:8080/api/health/live
curl -f -H "Host: ${PUBLIC_HOST}" http://127.0.0.1:8080/api/health/ready
```

配置模板以仓库根目录 `.env.example` 和 `compose.yaml` 为准；本清单用于迁移核对，不替代实际部署文件。
