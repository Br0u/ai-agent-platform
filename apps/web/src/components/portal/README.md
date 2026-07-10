# Portal components

公开门户组件放在这里，例如产品列表、版本说明、文档导航、兼容矩阵、Marketplace和支持页面。

- 页面入口：`src/app/<route>/page.tsx`
- 页面专属内容与交互：本目录下按模块建子目录
- 全站导航、页脚和设计令牌：`packages/ui`
- 数据库访问：`packages/database`
- 外部系统适配：`packages/integrations`

不要把控制台或运营后台组件放进本目录。
