# 模型供应商真实 API 冒烟验证

常规 CI 和离线 Docker E2E 只证明六家供应商适配器为 `adapter-tested`，不会访问外部模型 API。只有使用供应商自己的真实凭据完成单独验证，才能把该 Provider/Model 记录为 `real-API verified`。不提交未实际运行的验证矩阵。

## 两条真实验证路径

部署 bootstrap CLI 和后台动态“测试并启用”都调用 `agent_service.model_verifier.verify_model`，共享非空响应、超时和安全错误归类边界，但入口与证据不同：

- bootstrap CLI 验证 `MODEL_PROVIDER`、`MODEL_ID`、`MODEL_API_KEY_FILE` 和可选 `MODEL_BASE_URL` 的部署配置；
- Admin 动态验证经过权限、最近 MFA、Endpoint allowlist、加密持久化、双层审计和活动指针事务。

两条路径都依赖真实凭据和模型网络，因此都在默认 CI 之外。正式冒烟一次只验证一个 Provider、一个 Model、一个进程，不批量挂载多家凭据；结果按 Provider 分开记录。适配器单测或离线确定性模型通过，不能替代真实 API 证据。

## bootstrap CLI 运行

宿主机必须预装可通过 `PATH` 找到的 `python3`，用于安全读取并快照 `0600` 密钥文件；这是包装脚本的宿主机依赖，与容器内 Python 分开。准备仓库外的绝对路径密钥文件，然后从仓库根目录显式运行：

```bash
MODEL_PROVIDER=openai \
MODEL_ID=<real-model-id> \
MODEL_API_KEY_FILE=/absolute/path/to/model_api_key \
./docs/testing/run-model-provider-smoke.sh
```

支持的 `MODEL_PROVIDER`：`openai`、`anthropic`、`google`、`dashscope`、`deepseek`、`minimax`。可选设置 `MODEL_BASE_URL` 和 1～50 的整数 `MODEL_RUN_TIMEOUT_SECONDS`；两者先经过与生产运行时相同的配置验证。

成功时标准输出只有一行：

```text
<provider>/<model-id>: verified
```

脚本不打印提示词、模型回答、密钥、URL、会话标识、原始异常、Compose 日志或堆栈。失败只返回固定类别和非零状态。它使用独立临时 Compose 项目和默认外联网络，不连接生产 DB、AgentOS 或 Web；结束和中断都会清理本次拥有的资源、锁与临时文件。

## Admin 动态验证

在隔离或生产批准的部署中设置 `AGENT_ENABLED=true`、`ASSISTANT_PROVIDER_MODE=agentos`，完成 control role bootstrap/migration 后：

1. 使用有模型配置权限且最近 10 分钟内同时完成密码再认证和 TOTP 验证的账号进入 `/admin/assistant`；
2. 只保存当前要验证的一家 Provider 的真实 Model ID、批准的 Endpoint 和真实 Key；
3. 点击“测试并启用”，确认成功后记录 Provider、Model ID、时间、部署版本和执行人；
4. 立即按组织的凭据保留策略处理测试 Key，不在截图、日志或工单中记录明文或末四位。

测试失败不会替换旧活动模型。Admin 成功只能证明该次动态路径的真实 API 调用；不能反推其他 Model、Endpoint、Region 或后续时间仍可用。

## 本地算力边界

未来接入自有服务器上的本地模型仓库时，应扩展生产模型 registry 的正式本地 Provider/算力入口，并单独设计网络与资源验收。本冒烟任务不把 loopback、私网 URL 或 OpenAI-compatible 地址伪装成当前六家云 Provider；这些地址仍被 Endpoint allowlist 拒绝。
