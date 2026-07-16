# 模型供应商真实 API 冒烟验证

常规 CI 只证明六个供应商适配器是 `adapter-tested`，不会访问外部模型 API。某个供应商只有使用它自己的真实凭据单独执行本脚本且成功后，才可称为 `real-API verified`。不提交未实际运行的验证矩阵。

## 运行

宿主机必须预装可通过 `PATH` 找到的 `python3`，用于安全读取并快照 `0600` 密钥文件；这是运行包装脚本的宿主机依赖，与 Docker/容器内的 Python 分开。准备一个仓库外的绝对路径密钥文件，并将权限设为 `0600`。然后从仓库根目录显式运行：

```bash
MODEL_PROVIDER=openai \
MODEL_ID=<real-model-id> \
MODEL_API_KEY_FILE=/absolute/path/to/model_api_key \
docs/testing/run-model-provider-smoke.sh
```

支持的 `MODEL_PROVIDER` 只有：`openai`、`anthropic`、`google`、`dashscope`、`deepseek`、`minimax`。可选设置 `MODEL_BASE_URL` 和 1～50 的整数 `MODEL_RUN_TIMEOUT_SECONDS`；两者会先经过与生产运行时相同的配置验证。

成功时标准输出只有一行：

```text
<provider>/<model-id>: verified
```

脚本不打印提示词、模型回答、密钥、URL、会话标识、原始异常、Compose 日志或堆栈。失败只返回固定类别和非零状态；一次运行只验证一个供应商。

该流程使用独立的临时 Compose 项目、容器、镜像和默认外联网络，不连接生产 DB、AgentOS 或 Web。结束和中断都会清理本次拥有的资源、锁与临时文件。

未来接入本地模型仓库时，只扩展现有生产模型 registry 的正式供应商入口；本冒烟任务不新增虚假的本地 Provider。
