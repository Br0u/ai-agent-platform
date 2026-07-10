# 发现与决策

## 需求
- 项目根目录为当前 `AI Agent Platform`。
- 一期实现全站页面、基础后台、自建数据库和Docker部署能力。
- License、下载、OpenLab及所有外部依赖功能只做页面、接口、Mock和功能开关。
- UI使用蓝、靛、紫色系，以方向A为全站基线，融合方向B的产品展示和方向C的模块关系图。
- 所有真实资产先用集中式占位组件替代。
- GitHub仓库为 `https://github.com/Br0u/ai-agent-platform`。

## 研究发现
- 当前目录尚未初始化Git。
- 当前仅有文档、设计稿和预留目录，没有应用代码。
- PRD、系统架构、占位接口、部署准备和UI方向均已落地本地。
- GitHub远端实时状态尚未检查。
- 本机环境：Git 2.50.1、Node.js 26.0.0、pnpm 11.5.2、Docker 29.5.3、Docker Compose 5.1.4。
- 本机CPU为Apple Silicon `arm64`；开发镜像必须避免只支持x86_64的依赖，生产目标架构待后续确认。
- Next.js官方当前稳定线为16.2，16.3仍是Preview；一期固定稳定线，不追Preview。
- Next.js 16最低Node.js为20.9，Turbopack为默认构建器，Docker支持完整功能。
- Drizzle官方支持通过`node-postgres`或`postgres.js`连接PostgreSQL；一期采用`node-postgres`便于连接池和自建PostgreSQL。
- GitHub远端已有一个`Initial commit`，内容只有标题为`ai-agent-platform`的`README.md`；可安全沿用远端历史并把本地文档作为后续提交加入。
- 2026-07-10包标签确认：Next.js 16.2.10、React 19.2.7、Tailwind CSS 4.3.2、Vitest 4.1.10、Drizzle ORM 0.45.2、Drizzle Kit 0.31.10、pg 8.22.0。
- Next.js 16.3仍为Preview/Canary，一期不使用。

## 技术决策
| 决策 | 理由 |
|------|------|
| pnpm workspace | 支持应用和共享包，依赖管理明确 |
| Next.js App Router | 满足门户、后台、API和服务器渲染 |
| PostgreSQL | 自建、成熟、适合内容与权限数据 |
| Docker Compose单机基线 | 符合公司服务器一期部署目标 |
| Nginx/Caddy反向代理边界 | Next.js不直接暴露公网 |
| 功能开关 + Provider | 外部模块后续替换时不改页面契约 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 品牌资产缺失 | 使用有固定比例和明确标签的集中占位组件 |
| 生产服务器信息缺失 | 本地按Linux x86_64 Docker基线开发，部署前补充 |
| 本机代理可能失效 | 安装依赖时先检测，失败则用已批准的无代理方式或镜像源 |
| 沙箱内无法解析github.com | 使用获批的只读Git网络检查；不重复在沙箱内请求 |
| 一次补丁混用了新增与不存在文件更新 | 分开使用`Add File`和精确更新补丁 |
| pnpm 11忽略sharp构建脚本 | 使用`pnpm-workspace.yaml`的`allowBuilds: { sharp: true }`精确放行 |
| TypeScript 7超出typescript-eslint兼容范围 | 固定TypeScript 5.9.3，满足Next.js且符合`<6.1`peer约束 |
| `pnpm ignored-builds`写入了待填写的allowBuilds示例 | 删除占位映射，只保留`sharp: true` |
| Turbopack构建需要创建子进程并绑定本地端口 | 沙箱内会报Operation not permitted；获批后在沙箱外构建成功 |

## 资源
- `docs/product/PRD.md`
- `docs/architecture/system-design.md`
- `docs/api/integration-contracts.md`
- `docs/design/AI Agent Platform - UI Directions.html`
- `docs/design/brand-spec.md`
- `docs/deployment/server-readiness.md`

## 视觉/浏览器发现
- 三方向设计稿在1440×1100桌面视口正常显示。
- 390×844移动视口使用横向设计方向画布，页面本身无横向溢出。
- 设计稿包含3个方向，按钮最小高度44px。
- 浏览器控制台0错误、0警告。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
