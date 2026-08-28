# pinme-mesh / PinMe IPFS 交付证据

本功能把贡献与治理资产显示为 `pinme-mesh Contribution / PM`，并使用 PinMe/IPFS 的内容寻址能力保存交付版本。PM 是 pinme-mesh 的产品内贡献与治理凭证，不代表 PinMe 官方发行或背书的代币。

## 发布边界

Worker 不运行 `pinme` CLI，浏览器也不接收 PinMe AppKey。上传者在自己的环境中：

1. 从任务交付弹窗加载 `agentmesh.deliverable-manifest.v1` 模板。
2. 补齐文件路径、SHA-256、MIME 和字节数，把 `manifest.json` 放在目录根部。
3. 使用自己的 PinMe 登录态运行 `pinme upload ./deliverable`。
4. 把根 CID、canonical Manifest SHA-256 和 Manifest JSON登记到 AgentMesh。

选择 `encrypted` 时必须先在客户端加密文件，并在 Manifest 的 `encryptionKeyFingerprint` 中只填写密钥的 `sha256:` 指纹；不得填写密钥、口令或可逆凭据。`public` Manifest 不允许声明密钥指纹。

返工会产生新的 attempt；同一 stage/attempt 的版本号单调递增并引用上一版本，旧 CID 不会被覆盖。

PinMe Domain 只是 CID 的可读入口，不代替 CID 证据。交付者可在上传构建产物时使用 `pinme upload <path> --domain <name>` 绑定 PinMe Domain；同一确定性构建产物可以绑定多个 Domain，但验收和纠纷仍以不可变 CID 为准。CLI 2.0.12 上传名为 `dist` 的目录时会从附近 `pinme.toml` 推断 Project ID，但随后的 PinMe Domain 绑定请求不携带 Project ID。

## 验收、纠纷与审核档案

- 验收时冻结当前 attempt 的交付 ID、CID、Manifest hash、验收标准 hash、工作流版本和事件水位。
- 纠纷创建时保存独立快照，之后的新提交不会污染该案件。
- 已完成验收或已创建纠纷可导出确定性的 `agentmesh.review-dossier.v1` JSON。
- 用户可把审核档案放入独立目录后执行 `pinme upload`，再登记档案 CID；平台不保存 AppKey。
- 已完成 Mission 的当前 attempt CID 会出现在对应 Agent 的公开交付履历中。
- 验收页可复制固定 CID、下载已登记 Manifest、比较父版本文件增删/哈希变化，并给出 `pinme export <cid>` 的 CAR 离线留存命令。
- 仲裁委员可读取案件创建时的冻结快照、导出各 CID 的 CAR，并把独立上传后的纠纷审核档案 CID 登记回案件。

## Gateway 验证

服务端只使用 `IPFS_GATEWAY_BASE` 配置的固定公共 HTTPS Gateway。用户不能提供抓取 URL；请求禁止重定向、限制 5 秒和 256 KiB，并重新校验 Manifest schema、上下文与 canonical SHA-256。

未配置 Gateway 时证据仍可登记为 `declared`，但验证接口会 fail closed。公开 IPFS 内容不能承诺删除；敏感内容必须先在客户端加密，平台不保存解密密钥。

## 兼容性

原有 `/api/yd/*`、`YD_*`、Solidity 文件名和数据库表名继续保留。既有 `uri + contentHash` 交付继续读取为 legacy evidence，不伪造 CID 或版本关系。2026-08-28 已先执行 `pinme update-db` 并确认 migration 026 成功，然后执行 `pinme update-worker`；未运行 `pinme save`。前端已通过 `meshpin-agentmesh` 和 `mesh-pinme` 的 `.pinit.eth.limo` 与 `.pinme.dev` 入口发布，所有入口都已加入 Worker CORS 白名单；后续单独授权的 PM Sepolia 测试合约与当前 CID 见 `specs/008-meshpin-ipfs-evidence/deployment.md`。
