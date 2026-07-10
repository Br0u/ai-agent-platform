# 任务计划：AI Agent Platform 项目基础骨架

## 目标
建立可测试、可运行、可Docker部署并可持续扩展的全栈项目基础，连接本地Git与 `Br0u/ai-agent-platform`，为后续页面和业务模块提供稳定底座。

## 当前阶段
阶段 3

## 各阶段

### 阶段 1：需求与发现
- [x] 确认一期PRD与占位策略
- [x] 确认UI采用A为主、融合B/C
- [x] 确认GitHub仓库地址
- [x] 将发现记录到 findings.md
- **状态：** complete

### 阶段 2：规划与技术确认
- [x] 拆分基础骨架独立实施计划
- [x] 核对本机Node、pnpm、Git、Docker环境
- [x] 核对当前官方技术栈兼容性
- [x] 完成Git初始化与远端配置
- **状态：** complete

### 阶段 3：工程初始化
- [x] 初始化pnpm workspace和Next.js应用
- [x] 配置TypeScript、Lint、格式化与测试
- [ ] 建立共享UI、数据库和集成包
- [ ] 建立Docker开发环境
- **状态：** in_progress

### 阶段 4：基础功能实现
- [x] 先写失败测试
- [x] 实现设计令牌、全局框架和导航
- [x] 实现统一占位组件与路由注册表
- [ ] 实现数据库连接、迁移和健康检查
- **状态：** pending

### 阶段 5：测试与验证
- [ ] 运行单元测试、类型检查、Lint和生产构建
- [ ] 启动本地页面进行桌面/移动浏览器验证
- [ ] 验证Docker配置和健康检查
- [ ] 将结果记录到 progress.md
- **状态：** pending

### 阶段 6：Git交付
- [ ] 检查变更范围与敏感信息
- [ ] 创建精细Conventional Commits
- [ ] 确认是否推送GitHub
- **状态：** pending

## 关键问题
1. 公司生产服务器环境可在部署阶段补充，不阻塞本地基础开发。
2. GitHub远端是否为空需要通过Git检查确认。

## 已做决策
| 决策 | 理由 |
|------|------|
| 模块化单体 | 当前规模不需要微服务，降低部署和维护成本 |
| UI方向A为主 | 企业门户需要清晰、稳定、可扩展的信息结构 |
| 真实资产集中占位 | 不阻塞开发且避免伪造品牌和业务数据 |
| 管理员创建账号 | 一期不依赖SMTP和外部认证服务 |
| TDD实现业务行为 | 所有新功能先见到正确失败再写实现 |
| 不使用子代理 | 当前会话的协作规则未授权代理委派 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 内置浏览器桥接不可信 | 1 | 使用Playwright CLI完成设计稿验证 |
| 本地4173端口在沙箱内无权限 | 1 | 获得许可后仅绑定127.0.0.1 |
| npm请求错误指向失效代理127.0.0.1:1082 | 1 | 经许可临时取消代理环境变量 |
| 沙箱内Git无法解析github.com | 1 | 使用获批网络权限检查远端 |
| 规划文件合并补丁上下文未匹配 | 1 | 拆成精确局部补丁后更新 |
| 补丁错误地更新不存在的package.json | 1 | 改用Add File创建 |
| pnpm拒绝sharp构建脚本 | 1 | 只通过allowBuilds放行sharp |
| TypeScript 7不满足ESLint peer依赖 | 1 | 降至稳定5.9.3 |
| pnpm-workspace出现重复allowBuilds键 | 1 | 删除工具写入的待填写示例 |
| ESLint拒绝PostCSS匿名默认导出 | 1 | 使用命名常量后导出 |
| Prettier检查发现10个未格式化文件 | 1 | 运行项目Prettier机械格式化 |
| Turbopack构建在沙箱内无法绑定端口 | 1 | 按权限规则在沙箱外重跑并成功 |
| pnpm无TTY时拒绝重建modules目录 | 1 | 使用`CI=true`执行确定性离线安装 |
| CI模式因新增workspace依赖冻结锁文件 | 1 | 离线安装时显式使用`--no-frozen-lockfile`更新锁文件 |
| 本地pnpm store缺少Tailwind tarball | 2 | 本项目新增workspace后直接使用获批在线安装，不再使用offline |
| AppShell测试用文本查询匹配页头和页脚 | 1 | 改为按可访问名称查询首页链接 |
| 集成AppShell补丁未匹配格式化后的文件 | 1 | 读取实际格式后使用精确上下文补丁 |
| 共享包缺少ESLint Flat Config | 1 | 为UI和Integrations配置typescript-eslint推荐规则 |
| 共享包新增文件未格式化 | 1 | 使用Prettier机械格式化后复查 |
| pnpm start参数分隔符被Next识别为项目目录 | 1 | 改用`pnpm exec next start`传递主机和端口 |
| Next standalone配置警告不能使用next start | 1 | 浏览器验证改用next dev；Docker阶段直接运行standalone server.js |
| 实际首页缺少favicon导致404 | 1 | 添加纯色占位favicon，生产前替换正式品牌资产 |
| Playwright包装脚本无执行权限 | 1 | 明确通过bash调用脚本完成验收 |
| 未知路由触发Next开发模式Performance异常 | 1 | 状态码与404页面正确，记录为开发模式框架日志，后续用生产容器复核 |

## 备注
- 当前只执行“项目基础骨架”计划，不一次实现全部业务页面。
- 重大技术决策前重新读取本文件与 findings.md。
- UI与外部集成包已建立；数据库包和Docker仍在阶段3待完成。
