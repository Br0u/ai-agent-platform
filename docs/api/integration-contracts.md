# 外部能力占位接口契约

## 通用规则

- 所有占位模块必须由环境变量功能开关控制。
- 未启用时，页面显示明确的“尚未开放”，不能出现可点击但无结果的操作。
- API 返回 HTTP `501` 和稳定错误码 `FEATURE_DISABLED`。
- 页面数据类型、请求参数和返回结构提前固定；后续只替换 Provider 实现。

## 功能开关

```text
FEATURE_LICENSE=false
FEATURE_DOWNLOADS=false
FEATURE_OPENLAB=false
```

## 通用状态接口

```http
GET /api/v1/integrations/{module}/status
```

成功响应：

```json
{
  "module": "license",
  "enabled": false,
  "mode": "placeholder"
}
```

未启用业务操作响应：

```json
{
  "error": {
    "code": "FEATURE_DISABLED",
    "message": "该功能暂未开放"
  }
}
```

## Provider 边界

- `LicenseProvider`：查询授权、申请续期、解绑、下载授权文件。
- `DownloadProvider`：查询资源、获取下载凭证、查询下载记录。
- `OpenLabProvider`：提交申请、查询进度、撤回和重新提交。

一期仅实现 Disabled Provider 与开发 Mock Provider，不创建虚假业务规则。
