# 导航浏览器回归

模型供应商的可选真实 API 验证见 [model-provider-smoke.md](./model-provider-smoke.md)，入口为 `run-model-provider-smoke.sh`。该入口不属于常规 CI，必须显式提供单个供应商的真实凭据。

## Skill Registry 纵向验收

本计划只交付 Skill 库+审核闭环：本地 ZIP 上传、不可变 revision、双人审核、加密备份和恢复。Agent 仍不加载任何 Skill，`LocalSkills` 或其他运行时挂载属于下一计划，当前验收不得把“已发布”解释为“已运行”。

运行 `pnpm skill-registry:e2e`。`run-skill-registry-e2e.sh` 创建独立 Compose project、临时 0600 secrets 和仅含 `SKILL.md`、`scripts/hello.py` 的本地 fixture；它不下载第三方 Skill。验收覆盖 `workforce:admin` 上传与自审拒绝、`workforce:super_admin` 的近期密码/TOTP 保障和发布、Registry 重启持久性，并要求加密备份恢复后恰好存在与本次上传完全相同的 artifact SHA-256，而不只是任意非空且自洽的 digest；同时复用 Task 9 的 restore lifecycle 门禁。只有临时目录、容器、network、volume 和本地镜像全部清理成功后才输出 `Skill Registry E2E passed`，任何清理失败都固定返回非零且不输出临时路径、Secret、ZIP/源码或浏览器 storage state。

该回归由 Playwright CLI 驱动。`navigation-browser-regression.js` 是注入浏览器会话的函数，不是独立 Node.js 脚本，不应使用 `node navigation-browser-regression.js` 执行。

## 运行

先在项目根目录启动受控开发服务：

```bash
pnpm --filter @ai-agent-platform/web exec next dev --hostname 127.0.0.1 --port 3100
```

在另一个终端运行回归入口：

```bash
docs/testing/run-navigation-browser-regression.sh
```

如服务地址或 Playwright CLI 路径不同：

```bash
BASE_URL=http://127.0.0.1:3100 \
PWCLI="$HOME/.codex/skills/playwright/scripts/playwright_cli.sh" \
docs/testing/run-navigation-browser-regression.sh
```

入口会先检查健康端点，创建独立浏览器session，获取初始snapshot，执行断言，并通过trap在成功或失败时关闭浏览器。Web服务由调用者管理；运行结束后，在启动服务的终端按 `Ctrl-C` 停止。也可按监听端口停止：

```bash
kill "$(lsof -tiTCP:3100 -sTCP:LISTEN)"
```

## 断言范围

- 1440×1000：页脚4列、页脚链接至少44px高、无横向溢出；Mega Menu覆盖hover、点击固定、延迟关闭和完整键盘交互。
- 1181×800 / 1180×800：桌面导航与移动入口在精确断点正确切换。
- 1024×768：移动遮罩覆盖完整视口、打开时锁定body滚动、关闭后恢复。
- 390×844：抽屉覆盖完整高度、内容发生真实滚动、背景滚动被锁定、所有可见导航与页脚目标至少44×44px、底部登录可见、页脚单列、无横向溢出，并在关闭后恢复overflow和页面滚动位置。
- Console/CMS：在1440和390验证账号资料、License占位、产品内容、OpenLab占位和Analytics空状态；后台布局不得出现公开Mega Menu或页脚。
- 全程收集console error/warning、page error、request failure和HTTP 404；任何诊断记录都会使回归失败。

## CMS 文档完整验收

`run-cms-documents-e2e.sh` 是 CMS 文档迁移的强制隔离门禁。它创建唯一 Compose 项目和单次临时 secrets，构建当前 migrator/Web 镜像，启动隔离 PostgreSQL，运行全部 migration、权限 seed、runtime grant 和测试专用 workforce fixture，然后校验七篇种子文档与 `DOCUMENT_SEED_MANIFEST`。

运行：

```bash
bash docs/testing/run-cms-documents-e2e.sh
```

脚本会在 desktop 1440×900 和 mobile 390×844 下串行执行创建、保存、预览、发布、草稿隔离、slug alias、归档 404、重新发布和拒绝权限用例，再每 15 秒检查公开页、published checksum 与容器重启次数，持续 10 分钟。成功或失败都会删除 Compose 容器、volume、network 和临时 secrets。

只有清理完成后输出固定标记 `CMS documents E2E passed.` 才算通过。Docker、镜像构建、迁移、PostgreSQL 校验、fixture、浏览器、10 分钟观察或清理任一边界失败都返回非零；不存在缩短或替代该门禁的路径。真实目标环境的 Phase 2/3 步骤见 [CMS 文档迁移与回滚手册](../deployment/cms-document-migration.md)。
