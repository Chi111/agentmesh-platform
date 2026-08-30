# pinme-mesh / PinMe IPFS 交付证据

本功能把贡献与治理资产显示为 `pinme-mesh Contribution / PM`，并使用 PinMe/IPFS 的内容寻址能力保存交付版本。PM 是 pinme-mesh 的产品内贡献与治理凭证，不代表 PinMe 官方发行或背书的代币。

## 发布边界

正常交付不要求任务方或开发者在页面外运行 `pinme upload`：

1. 平台内置 Agent 的 Analyze 节点生成可交接的阶段底稿，不单独发布成客户 artifact；Implement 节点可以生成真实阶段制品。
2. 无出边的终结节点读取全部已完成工作流的有界摘要和当前 attempt 制品引用，形成完整任务成果包。运行过程 JSON 只写入阶段证据。
3. Worker 在内存中生成 `index.html`、`deliverable.md`、`acceptance-report.md`、`artifact-index.md`、`workstreams/*.md` 和根目录 `manifest.json`，优先使用任务方在设置中加密保存的 AppKey 调用 PinMe 上传协议；平台级 AppKey 仅作为可选回退。
4. PinMe 返回根 CID 与公开链接后，需要发布制品的节点才算完成，并同时保存 CID、Manifest hash 和父版本；纯分析节点不需要 AppKey。
5. 验收页默认展示完整任务成果包和“打开完整成果包”入口，阶段制品可切换核对；原始 JSON 收进技术证据区，不作为收费交付物。

任务方可在“设置 → PinMe 自动交付”中保存自己的 AppKey。浏览器只提交一次，Worker 使用项目 secret 派生的 AES-GCM 密钥加密后写入 `user_pinme_credentials`；读取接口只返回配置状态、脱敏账户和更新时间。明文不进入 D1、日志、Git、前端包或 API 响应。任务执行优先使用任务方自己的 Key；`PINME_UPLOAD_APP_KEY` 仅保留为可选的平台级回退。外部 Agent 应在签名回调中直接提交已经发布的 CID 与 Manifest；旧版人工登记仅作为迁移兼容入口，不属于正常流程。

选择 `encrypted` 时必须先在客户端加密文件，并在 Manifest 的 `encryptionKeyFingerprint` 中只填写密钥的 `sha256:` 指纹；不得填写密钥、口令或可逆凭据。`public` Manifest 不允许声明密钥指纹。

返工会产生新的 attempt；同一 stage/attempt 的版本号单调递增并引用上一版本，旧 CID 不会被覆盖。

PinMe Domain 只是 CID 的可读入口，不代替 CID 证据。交付者可在上传构建产物时使用 `pinme upload <path> --domain <name>` 绑定 PinMe Domain；同一确定性构建产物可以绑定多个 Domain，但验收和纠纷仍以不可变 CID 为准。CLI 2.0.12 上传名为 `dist` 的目录时会从附近 `pinme.toml` 推断 Project ID，但随后的 PinMe Domain 绑定请求不携带 Project ID。

## 验收、纠纷与审核档案

- 验收时冻结当前 attempt 的交付 ID、CID、Manifest hash、验收标准 hash、工作流版本和事件水位。
- 纠纷创建时保存独立快照，之后的新提交不会污染该案件。
- 已完成验收或已创建纠纷可按需导出确定性的 `agentmesh.review-dossier.v1` JSON；它只用于争议核对和技术审计，不是客户成品。
- 已完成 Mission 的当前 attempt CID 会出现在对应 Agent 的公开交付履历中。
- 验收页可复制固定 CID、下载已登记 Manifest、比较父版本文件增删/哈希变化，并给出 `pinme export <cid>` 的 CAR 离线留存命令。
- 仲裁委员可读取案件创建时的冻结快照、导出各 CID 的 CAR，并把独立上传后的纠纷审核档案 CID 登记回案件。

## Gateway 验证

服务端只使用固定公共 HTTPS Gateway：默认 `https://ipfs.io`，也可通过 `IPFS_GATEWAY_BASE` 覆盖。用户不能提供抓取 URL；请求禁止重定向、限制 5 秒和 256 KiB，并重新校验 Manifest schema、上下文与 canonical SHA-256。

Gateway 网络不可用或响应不合法时，证据仍保留并标记为 `unavailable` 或对应失败状态。公开 IPFS 内容不能承诺删除；敏感内容必须先在客户端加密，平台不保存解密密钥。

## 兼容性

原有 `/api/yd/*`、`YD_*`、Solidity 文件名和数据库表名继续保留。既有 `uri + contentHash` 交付继续读取为 legacy evidence，不伪造 CID 或版本关系；JSON MIME 不再满足付费 Implement 节点的客户制品门禁。2026-08-28 已先执行 `pinme update-db` 并确认 migration 026 成功，然后执行 `pinme update-worker`；未运行 `pinme save`。前端已通过 `meshpin-agentmesh` 和 `mesh-pinme` 的 `.pinit.eth.limo` 与 `.pinme.dev` 入口发布，所有入口都已加入 Worker CORS 白名单；后续单独授权的 PM Sepolia 测试合约与当前 CID 见 `specs/008-meshpin-ipfs-evidence/deployment.md`。
