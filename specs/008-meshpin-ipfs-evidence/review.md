# pinme-mesh / PinMe IPFS Evidence Review

状态：通过
日期：2026-08-27
分支：`codex/meshpin-ipfs-evidence`

## 结论

本地差异审阅通过，无 P0/P1/P2 阻断问题。实现保持原有 Escrow、任务支付资产、`/api/yd/*`、数据库历史表和旧 `uri + contentHash` 交付兼容。后续已按独立授权完成 D1/Worker/Web 拆分发布和 Sepolia PM 测试合约部署；没有创建额外服务器或运行 `pinme save`。

## 已审边界

- CID 使用 `multiformats` 真实解析并规范化为 CIDv1；Manifest canonical JSON 有深度、节点、字节数、文件数、路径和总大小限制。
- Worker 只访问服务端固定的公共 HTTPS Gateway，禁止用户 URL、凭据和重定向，且限制 5 秒与 256 KiB。
- 手工提交和 Agent callback 共用 Manifest 校验，并在 Store 原子边界写入 deliverable 与 companion evidence；scope/version/parent 唯一约束处理并发冲突。
- 验收和纠纷保存不可更新的交付集合、验收标准 hash、工作流版本、调度 revision 和事件水位；审核档案 hash 可重复计算。
- 仲裁委员只能通过已授权案件访问纠纷档案；验收档案 subject 强制绑定 Mission，纠纷档案 subject 强制绑定可访问案件。
- Agent 公开 CID 履历只派生自已完成 Mission 的当前 attempt，不返回 encrypted Manifest 文件清单或密钥。
- 前端不接收 PinMe AppKey；上传、CAR 导出和审核档案发布均由用户自己的 PinMe 登录态完成。

## 审阅中修复

- 补齐验收审核档案 `subjectId` 与 Mission 的强绑定，防止同一快照登记到任意 subject。
- 允许活跃仲裁委员读取其可访问案件的冻结档案，同时保持普通 Mission 详情权限不扩张。
- 增加 canonical JSON 复杂度限制、Gateway 超大响应和重定向回归覆盖。
- 补齐 Manifest 父版本文件 diff、CID/Manifest 操作、CAR 指引与纠纷档案 CID 登记。

## 剩余发布风险

- 默认固定 Gateway 或 `IPFS_GATEWAY_BASE` 覆盖地址不可用时，验证会 fail closed 为 `unavailable`，但证据仍可登记和人工审阅。
- 公开 IPFS 内容不能保证删除或永久可用；敏感交付必须在上传前由客户端加密。
- PM 已完成公开品牌、Sepolia 测试合约部署和可回收奖励/锁仓冒烟；主网合约部署或既有链上迁移仍需独立审批。
