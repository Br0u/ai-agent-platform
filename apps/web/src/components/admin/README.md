# Admin components

内部运营和CMS后台组件放在这里，例如站点、导航、产品、版本、内容、用户、角色和审计管理。

- 页面入口：`src/app/admin/`
- 管理员权限边界：后续在`src/app/admin/layout.tsx`实现
- 共享视觉基础：`packages/ui`
- 内容与权限数据：`packages/database`

公开门户和客户控制台不得直接依赖本目录组件。
