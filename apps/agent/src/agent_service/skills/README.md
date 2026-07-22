# Skills extension boundary

Skill 库+审核与码多多运行时已打通，但发布不等于启用。Agent 只加载 Registry 中已发布、由具备配置权限且完成近期 MFA 的管理员显式激活的 exact revision；未进入活动集合的 revision 一律不可见。

当前没有把 Agno `LocalSkills` 直接挂到任意本地目录。运行时使用只读数据库角色，将活动集合重新校验并物化到受限 tmpfs，再按 run 固定 generation；`published` 状态本身仍不能证明 Skill 已对 Agent 生效。GitHub、GitLab、GitCode 导入和更强的脚本级沙箱属于下一计划。
