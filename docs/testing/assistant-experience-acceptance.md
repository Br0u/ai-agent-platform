# AI 助理三形态浏览器验收

## 验收入口

```bash
sh docs/testing/run-assistant-experience-e2e.sh
```

脚本默认使用隔离 Compose 项目 `aap-assistant-e2e`。并发或保留旧项目用于人工核查时，可以使用同前缀的独立项目：

```bash
AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT=aap-assistant-e2e-task9 \
  sh docs/testing/run-assistant-experience-e2e.sh
```

脚本在构建前原子取得项目锁，并拒绝接管已有容器、卷、网络、项目镜像或已被占用的 `8080` 端口。只有本次运行取得所有权后，退出 trap 才执行 `down --rmi local -v --remove-orphans`，随后删除临时 secret 目录和自己的锁。

## 自动验证范围

- 同时运行 `e2e/assistant-experience.spec.ts` 与 `e2e/pricing-assistant.spec.ts`，不会遗漏旧价格计算验收。
- 顶部入口打开右侧 Dock；桌面默认宽度为 `480px`，拖拽边界为 `380–760px`，键盘方向键可调整。
- 只有正常 pointer up 和键盘调整写入宽度偏好；pointer cancel 不写入，刷新恢复最近一次主动宽度。
- Quick → Dock → `/assistant` 共用草稿、消息和进行中的单次请求；Dock 可收起为 Quick。
- 遮罩与 Escape 可关闭 Dock，并把焦点还给原入口；任意时刻只有一个 dialog。
- `390×844` 下 Dock 全屏且无 separator；缩小 viewport 模拟软键盘后输入区仍在可视范围，消息区可滚动且页面无横向溢出。
- 采集所有 console 类型、page error、request failure 和意外 `404/429/5xx`；只对白名单内的占位服务或限流响应放行。
- 继续覆盖价格计算、登录/注册、管理员助手及客户端路由中的助手会话回归。

## 最新真实运行记录

- 静态契约：`37/37` 通过。
- Playwright：两个 spec、两个项目共发现 `22` 个用例。
- 完整 runner 两次使用官方 npm registry 构建，分别在 `937/943`、`935/943` 个依赖下载后因网络超时退出，均未进入 Playwright；镜像源复核同样返回连接重置，因此没有继续盲目重试。
- 每次失败后的独立项目容器、卷、网络、项目镜像、锁和临时 secret 均为 `0` 残留。
- 转为本机已安装依赖后，production standalone 构建成功，`38/38` 个静态页面生成。
- standalone 服务在 `127.0.0.1:3100` 上完成本任务新增的三条关键浏览器验收：桌面伸缩与偏好持久化、Quick → Dock → 独立页单请求连续性、移动端全屏与软键盘可见性，结果为 `3 passed, 3 skipped`（按项目视口跳过不适用用例）。
- 旧的快捷问答预设依赖 E2E PostgreSQL fixture；单独启动无数据库的 standalone 时按设计返回 `503`，不作为本地 standalone 通过项。完整数据库/认证/价格计算回归仍以可联网环境中的隔离 runner 为准。
