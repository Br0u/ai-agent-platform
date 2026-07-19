# apps/web

Next.js App Router全站应用，包含公开门户、客户控制台、运营后台和服务端API。

## 目录边界

```text
src/
├── app/                         # URL路由与布局
│   ├── product/                 # 公开门户页面
│   ├── console/                 # 登录后客户控制台
│   ├── admin/                   # 内部运营后台
│   ├── api/                     # 服务端API
│   └── [...slug]/               # 未知或遗漏地址兜底
├── components/
│   ├── portal/                  # 公开门户业务组件
│   ├── console/                 # 客户控制台业务组件
│   ├── admin/                   # 运营后台业务组件
│   └── route-scaffold/          # 搭建中/功能禁用统一页面
├── features/<module>/           # 聚焦功能的领域模型、配置、纯逻辑和客户端协调器
├── server/<module>/             # server-only应用端口、内部Provider与第一方AgentOS BFF适配器
├── assets/                      # 字体与页面素材
└── config/routes.ts             # PRD路由和状态登记表
```

共享导航、页脚和设计令牌位于`packages/ui`；数据库位于`packages/database`；外部能力适配器位于`packages/integrations`。

`src/features/<module>`用于一个聚焦功能内的领域类型、静态配置、纯函数和客户端状态协调，不放数据库访问或外部服务SDK。`src/server/<module>`可以定义应用端口、内部Provider，以及调用本平台第一方内部AgentOS服务的server-only BFF适配器；这类适配器持有内部凭据，不进入客户端包。凡是调用第三方服务、模型供应商API或其SDK的外部集成，仍必须放在`packages/integrations`，再通过应用端口接入。第一方内部AgentOS BFF适配器是当前批准的应用边界，不等同于第三方外部集成。

## 开发一个页面模块

以`/product`为例：

1. 在`src/app/product/page.test.tsx`先写页面契约测试。
2. 在`src/app/product/page.tsx`装配页面；不要把大段业务组件直接写进路由文件。
3. 在`src/components/portal/product/`创建产品组件、内容配置和模块样式。
4. 需要数据时，在`packages/database`增加schema和查询；需要外部服务时，在`packages/integrations`增加Provider。
5. 页面完成后，将`src/config/routes.ts`中的状态从`scaffold`改为`live`。
6. 运行测试、类型检查、Lint、格式检查和生产构建。

动态页面使用Next.js目录参数，例如`product/[slug]/page.tsx`。已存在明确目录的页面会优先于`[...slug]`兜底路由。

## 状态规则

- `live`：正式实现。
- `scaffold`：目录和页面壳已建立，等待业务开发。
- `placeholder`：依赖外部资源，只显示`FEATURE_DISABLED`，不提供假按钮和假数据。

License、下载中心、OpenLab及其他尚未接入的外部能力必须保持`placeholder`。

## 常用命令

```bash
pnpm dev
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm build
```
