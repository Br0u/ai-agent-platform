## 接口约定

API 统一使用 HTTPS 和 JSON。需要登录的接口通过会话 Cookie 或服务端 API Key 鉴权，响应错误包含稳定的 `code` 和可读的 `message`。

健康检查示例：`GET /api/health/ready`，请求头使用 `Accept: application/json`，成功响应包含 `status: ready`。

## 鉴权和权限

客户、内部员工和管理员使用不同的访问边界。服务端必须再次校验角色与权限，不能只依赖前端隐藏菜单。

:::callout{type="info"}
Agent、知识库和模型网关接口的详细 schema
会随对应模块稳定后补齐；当前页面先作为统一入口和契约索引。
:::
