# Registered route scaffold

本目录只负责把`config/routes.ts`中的路由状态渲染成统一页面：

- `scaffold`：显示页面结构已建立。
- `placeholder`：显示功能尚未开放和`FEATURE_DISABLED`。
- 未登记地址：进入Next.js 404。

正式业务页面开发后应替换对应页面壳，不要把业务逻辑继续堆入本目录。
