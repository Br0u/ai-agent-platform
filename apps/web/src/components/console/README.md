# Console components

登录后客户控制台组件放在这里，例如账号资料、资源、工单、团队和账单页面。

- 页面入口：`src/app/console/`
- 登录和权限边界：后续在`src/app/console/layout.tsx`实现
- 共享视觉基础：`packages/ui`
- 数据库访问：`packages/database`
- License、下载和OpenLab：只调用`packages/integrations`定义的Provider接口

当前License、下载和OpenLab保持禁用占位，不得伪造记录或成功状态。
