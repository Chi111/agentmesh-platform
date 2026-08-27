# MeshPin 品牌与 PinMe IPFS 交付证据设计

状态：待方案批准
审批门禁：`meshpin-ipfs-evidence-004`

## 设计结论

首版采用“PinMe CLI/网站负责上传，AgentMesh 负责索引、验证、版本和纠纷冻结”的边界。Cloudflare Worker 不运行 CLI，前端不接触 AppKey，也不假设 PinMe 存在已经公开承诺的浏览器直传 API。

```text
交付目录 + manifest.json
        |
        | pinme upload（Agent/开发者自己的 PinMe 登录态）
        v
IPFS 根 CID ---------------> PinMe/IPFS Gateway
        |
        | CID + Manifest 摘要 + 版本父节点
        v
AgentMesh Worker -> D1 deliverables + deliverable_ipfs_evidence + 审计事件
        |                                      |
        |                                      +-> 返工/版本时间线
        +-> 验收快照 -> 纠纷冻结快照 -> 仲裁视图 -> pinme export CID（离线 CAR）
```

## 现有基础

- `deliverables` 已保存 Mission、stage、attempt、Agent、URI、content hash、MIME、状态和创建时间。
- 当前 attempt 隔离已经阻止旧返工交付物满足新 attempt。
- 验收和纠纷流程已有 URI/事件基础，但没有明确的 CID 解析、Manifest、父版本链和纠纷时点快照。
- 因此采用 companion tables 扩展，不把现有 `deliverables` 改造成另一套逻辑实体。

## 品牌适配

新增集中式公开资产描述，例如：

```ts
{
  name: 'MeshPin Contribution',
  symbol: 'MPIN',
  testName: 'AgentMesh Test MeshPin',
  testSymbol: 'tMPIN',
  purpose: 'contribution_and_governance',
}
```

- Worker API 和前端从同一逻辑常量生成公开文案。
- `/api/yd/*`、`YD_*`、`ydFinance`、Solidity 文件名和既有数据库表名首版保持兼容。
- `TestYDToken` 仅修改未来部署时的 ERC-20 name/symbol；没有部署行为，也不修改任何已存在地址。
- UI 和文档明确 MPIN 与任务支付资产隔离，不出现 APY、价格或投资回报暗示。

## Manifest 规范

目录根部固定为 `manifest.json`：

```json
{
  "schema": "agentmesh.deliverable-manifest.v1",
  "missionId": "TASK-...",
  "stageId": "stage-...",
  "attemptNo": 2,
  "agentId": "agent-...",
  "logicalName": "研究报告与数据包",
  "versionNo": 3,
  "supersedesRootCid": "bafy...",
  "createdAt": "2026-08-27T00:00:00.000Z",
  "generator": "agentmesh-pinme-publisher/1",
  "files": [
    {
      "path": "report.pdf",
      "sha256": "0123...",
      "mimeType": "application/pdf",
      "byteSize": 123456
    }
  ]
}
```

规范化规则：UTF-8、相对 POSIX 路径、按路径排序、禁止重复/绝对/父目录路径、时间使用 UTC ISO 8601、整数使用十进制 JSON number。Manifest 不能包含根 CID 自身，避免自引用；D1 将根 CID 与 Manifest hash 绑定。

## D1 模型

新增 `db/026_meshpin_ipfs_evidence.sql`，只新增表和索引。

### `deliverable_ipfs_evidence`

- `deliverable_id`：主键，引用既有 `deliverables.id`。
- `mission_id`、`scope_key`：反规范化索引；`scope_key` 区分 stage/attempt 与任务级最终交付。
- `version_no`、`supersedes_deliverable_id`：同一 scope 内的单父版本链。
- `provider`：首版固定 `pinme_ipfs`。
- `root_cid`、`manifest_path`、`manifest_sha256`。
- `file_count`、`total_bytes`、`visibility`。
- `verification_status`、`last_verified_at`、`last_verification_error`。
- `submitted_by`、`created_at`。
- 唯一约束：`(mission_id, scope_key, version_no)`；同一 scope 的 `root_cid` 不重复。

`scope_key` 示例：

- `stage:<stageId>:attempt:<attemptNo>`
- `mission:final`

### `dispute_evidence_snapshots`

- `dispute_id`、`deliverable_id` 联合主键。
- 冻结 `root_cid`、`manifest_sha256`、`version_no`、`stage_id`、`attempt_no`。
- 冻结 `workflow_version`、`scheduler_revision`、`acceptance_criteria_hash`、`event_watermark`。
- `snapshot_at`。

数据库中不保存文件本体、PinMe AppKey 或解密密钥。已有交付记录不回填虚构证据行。

## API 变化

### 提交交付物

扩展现有 `POST /api/missions/:missionId/deliverables`：

```json
{
  "stageId": "stage-...",
  "name": "研究报告与数据包",
  "uri": "ipfs://bafy...",
  "contentHash": "sha256:...",
  "mimeType": "application/vnd.agentmesh.manifest+json",
  "ipfsEvidence": {
    "provider": "pinme_ipfs",
    "rootCid": "bafy...",
    "manifestPath": "/manifest.json",
    "manifestSha256": "sha256:...",
    "fileCount": 2,
    "totalBytes": 123456,
    "visibility": "public",
    "versionNo": 2,
    "supersedesDeliverableId": "DEL-..."
  }
}
```

- 现有无 `ipfsEvidence` 请求保持兼容，响应标记为 legacy/unverified。
- Agent callback 的 artifact 结构使用同一验证函数，避免手工提交与自动回调产生不同规则。
- 新版本写入 deliverable、IPFS evidence 和事件必须在同一 Store 原子边界完成。

### 读取与验证

- `GET /api/missions/:missionId/deliverables` 返回可见版本链和 IPFS evidence 摘要。
- `POST /api/missions/:missionId/deliverables/:id/verify` 对固定 Gateway 做有界 Manifest 验证，并追加验证事件。
- Mission detail 和验收页面默认返回当前 attempt 的最新版本，同时允许显式读取历史版本。
- Dispute detail 返回创建时冻结的 `evidenceSnapshot`，不动态替换为新版本。

## CID 与 Gateway 验证

- 引入直接依赖的 Worker 兼容 CID 解析库（优先 `multiformats`），拒绝非规范 CID、超长值和不支持的 scheme。
- 服务端只接受 `ipfs://<cid>` 或结构化 `rootCid`；HTTP Gateway URL 只作为展示派生值，不作为证据主键。
- 固定 Gateway 基址由服务端配置，用户输入不能改变协议、主机、端口或重定向目标。
- Manifest fetch 使用短超时、无凭据、禁止跨主机重定向，并限制响应体不超过 256 KiB。
- 校验 schema、Mission/stage/attempt/version/父 CID、Manifest SHA-256、文件数量和总大小。
- 首版不在 Worker 请求内下载所有大文件重算 SHA-256；根 CID保证 DAG 内容寻址，逐文件 hash 用于本地/审阅工具复核。
- 验证结果追加事件。`hash_mismatch` 和 `invalid_manifest` 不能被“人工确认”覆盖，只能提交新版本。

## 版本并发与状态

```text
declared -> verified
declared -> unavailable -> verified（重试成功）
declared -> hash_mismatch | invalid_manifest（终态，提交新版本）
verified -> availability_warning（只追加事件，不撤销历史验证）
```

- Store 在同一事务/批处理中检查父版本 scope、当前最大版本和唯一约束。
- 客户端提供的 `versionNo` 只作为 CAS 预期，服务端不接受跳号。
- 被拒绝版本仍保留；新版本引用它，不能修改其 CID、Manifest 或创建时间。
- 验收快照保存实际版本 ID 列表，而不是“当前最新”查询条件。

## 前端体验

### 提交流程

- “提交可验证交付物”弹窗增加 PinMe/IPFS 模式和 legacy URL 模式。
- PinMe 模式展示不含密钥的操作说明：生成 Manifest、执行 `pinme upload`、粘贴根 CID/Manifest hash。
- 默认自动选中同一 stage/attempt 的最新版本为父版本，并显示将创建的版本号。
- `public` 与 `encrypted` 有不可忽略的可见性说明；不提供虚假的“私密 IPFS”选项。

### 验收与仲裁

- 验收页提供版本时间线：版本号、attempt、CID 缩写、Manifest hash、文件数/大小、验证状态、接受/拒绝状态。
- 支持比较两个 Manifest 的新增、删除、hash 变化和大小变化，不尝试对任意二进制内容做语义 diff。
- 纠纷页标注“案件冻结版本”，后续提交显示在历史中但不进入该案件证据集合。
- 提供复制 CID、打开固定 Gateway、下载 Manifest 和 CAR 导出命令提示。

## PinMe 能力映射

- `pinme upload`：发布单文件或目录，获取根 CID。
- `pinme list`：排障和运营历史，不作为案件真相源。
- `pinme export <cid>`：导出 CAR 证据包。
- `pinme import <car>`：恢复或增加 pin，不改写 AgentMesh 版本。
- `pinme bind`/域名：适合公开演示页；验收和纠纷始终保存 CID，不能只保存可变域名。
- Worker + D1、认证、邮件和 LLM 能力继续复用；可在后续版本用邮件通知版本变化、用 LLM 总结 Manifest diff，但 LLM 结论不作为完整性证明。

## 安全与隐私

- PinMe AppKey 只存在于上传者自己的 CLI 登录态或未来经过批准的服务端 secret，不进入前端。
- 服务端 Gateway fetch 使用 allowlist，拒绝 localhost、私网、任意 URL 和用户控制重定向。
- Manifest path 防目录穿越；文件条目数量、路径长度、总字节数和 JSON 深度均设上限。
- API 权限沿用现有 Mission/Agent/stage 所有权与 attempt 校验。
- `encrypted` 仅描述“上传前已经加密”，平台不托管明文密钥；密钥交换和恢复策略另立需求。
- 公开 IPFS 内容不能承诺删除；需要撤回时只能停止引用、取消本方 pin 并提交替代版本。

## 测试策略

- 单元：CID、Manifest 规范化、路径安全、版本 CAS、父版本 scope、品牌元数据。
- Store：D1/MemoryStore 版本链一致性、并发冲突、原子提交、纠纷快照不可变。
- Worker：权限、legacy 兼容、Gateway allowlist、超时/大小/重定向、hash mismatch、callback parity。
- 前端：提交表单、风险提示、版本时间线、Manifest diff、当前 attempt 过滤、冻结证据。
- E2E：v1 -> v2 -> 返工 attempt 2 -> v1、验收绑定、纠纷后新版本不污染案件。
- 回归：现有 backend、Chromium、contracts、Worker dry-run 和 frontend build。

## 发布与回滚

- 方案批准后才允许写业务代码；实现完成后仍需 Review Gate 与 QA。
- D1 迁移仅新增 companion tables；功能回滚可停止写入新表并继续读取 legacy deliverables。
- 前端/Worker/D1 部署必须再次获得用户明确授权，并使用项目规定的 `pinme save`。
- MPIN 测试合约或正式合约部署不包含在本功能授权中。

## 后续阶段

- PinMe 若提供稳定、受支持的服务端上传 API，再设计 Worker 侧短期上传授权或上传代理；不得从 CLI 私有实现猜测接口。
- 可增加客户端加密、组织密钥管理、多 pin provider 和周期可达性监测。
- 可生成每次验收的不可变静态审阅页并独立上传到 IPFS。
