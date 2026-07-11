# 导航浏览器回归

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
