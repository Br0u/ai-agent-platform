# 价格计算与 M 助手视觉验收

## 设计选择

- 实现方向：A / 保守结构化面板。
- 原因：与当前公开门户的双栏信息结构、边框密度和主操作层级最一致；M 助手保持明确入口但不压过价格配置任务。
- B、C 作为后续密度和文案语气的参考，不进入本次实现。

## 占位素材验收

- 浏览器：Google Chrome（由 Playwright 1.61.1 驱动本机 Chrome）。
- 桌面：`1440 × 1000`；`scrollWidth = 1440`，无横向溢出；三种方案与真实中文文案完整；A 被标记为实现方向。
- 移动：`390 × 844`；`scrollWidth = 390`，无横向溢出；仅显示移动构图，配置区在摘要区之前，助手呈底部抽屉。
- 控制台：首次桌面加载仅发现浏览器请求默认 favicon 导致的 `404`；已通过内联空 favicon 修复，复验记录在最终验收中。
- 占位状态：三种方案均使用明确标注的 `M ASSISTANT ASSET` 占位，不伪造角色素材。

## 最终素材验收

- 生成方式：内置图片生成；原始结果使用均匀绿色色键背景，本地运行 `remove_chroma_key.py` 生成透明 PNG，未切换 CLI/API。
- 透明源图：`docs/design/assets/m-assistant/source.png`，`1254 × 1254`，RGBA；alpha 范围 `0—255`，四角 alpha 均为 `0`，可见内容边界 `(197, 153, 1057, 1100)`。
- 生产图：`apps/web/public/assets/assistant/m-assistant.webp`，由 `cwebp` 生成；`sips` 验证为 `256 × 256`、`hasAlpha: yes`。
- 64px 检查：使用 `sips` 缩放为 `64 × 64` 后人工检查；字母 M、双腿、短机械臂和中央紫色状态灯仍可辨认，无明显绿色边缘。
- HTML：三种方案均引用 `/apps/web/public/assets/assistant/m-assistant.webp`，没有残留素材占位。
- 桌面复验：Google Chrome，`1440 × 1000`；`scrollWidth = 1440`，无横向溢出；3 张生产图全部完成加载且原始尺寸为 `256 × 256`；控制台错误 `0`，失败请求 `0`。
- 移动复验：Google Chrome，`390 × 844`；`scrollWidth = 390`，无横向溢出；桌面构图隐藏、移动构图显示；3 张生产图全部完成加载；控制台错误 `0`，失败请求 `0`。
- 最终选择：A / 保守结构化面板。
