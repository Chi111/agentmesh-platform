# MeshPin 品牌与 PinMe IPFS 交付证据需求

状态：待方案批准
日期：2026-08-27
审批门禁：`meshpin-ipfs-evidence-004`

## 目标

在不改变任务支付资产、Escrow 权限和既有历史交付物的前提下：

1. 将当前面向用户的 YD 奖励与治理凭证品牌调整为拟定的 `MeshPin Contribution`，符号 `MPIN`。
2. 让 Agent/开发者通过 PinMe 将交付目录发布到 IPFS，并在 AgentMesh 中形成不可覆盖的版本链。
3. 让验收、返工和纠纷能够定位到确定的 CID、Manifest、工作流 attempt 和提交时间，而不是依赖可变 HTTPS 链接或口头说明。

## 品牌范围

- 面向用户统一显示：`MeshPin`、`MPIN`、`MeshPin Rewards & Governance`。
- 中文定位为“贡献与治理凭证”，不得称为任务支付币、收益产品或保本资产。
- 页面可说明“交付证据由 PinMe/IPFS 提供内容寻址能力”，但在没有正式授权证明时不得宣称 `MPIN` 是 PinMe 官方代币。
- 测试网固定供应代币拟改为 `AgentMesh Test MeshPin` / `tMPIN`；正式合约部署仍需独立审批。
- 为兼容现有 Worker、D1、配置和集成，首版保留内部 `/api/yd/*`、`YD_*`、`ydFinance` 和既有表名；新增集中式公开显示元数据，避免散落硬编码。
- 线上当前未配置 YD/MPIN 合约，因此本阶段不迁移链上余额、地址或历史交易。

## 角色与主要流程

### Agent/开发者

- 在本地或 Agent 运行环境生成规范化 `manifest.json`。
- 使用自己的 PinMe 登录态执行 `pinme upload <交付目录>`，获得根 CID。
- 向 AgentMesh 提交根 CID、Manifest 摘要和版本关系；不得向浏览器或 AgentMesh 前端提供 PinMe AppKey。
- 返工时创建新版本并显式引用被替代版本，不得覆盖旧 CID 或旧数据库记录。

### 任务方/验收人

- 查看当前 attempt 的交付版本时间线、文件清单、哈希、大小、提交者和可达性状态。
- 能够打开固定 CID 对应内容，并明确区分当前版本、历史版本和被拒绝版本。
- 验收动作必须绑定当时的交付版本集合，后续新提交不能改写已经作出的验收证据。

### 仲裁委员/管理员

- 纠纷创建时自动冻结相关交付版本、验收标准版本、工作流 revision、stage attempt 和事件水位。
- 仲裁页面显示冻结证据，而不是动态查询“最新交付物”。
- 能按 CID 导出 CAR 证据包供离线留存或恢复，但 CAR 导出本身不改变案件状态。

## 交付 Manifest

每个 PinMe 交付目录包含 `manifest.json`，使用 `agentmesh.deliverable-manifest.v1`：

- `missionId`、`stageId`、`attemptNo`、`agentId`。
- `logicalName`、`versionNo`、`supersedesRootCid`。
- `createdAt` 和生成工具版本。
- 文件条目：相对路径、SHA-256、MIME、字节数。
- 不得包含访问令牌、AppKey、私钥、明文解密密钥或无必要的个人信息。

AgentMesh 同时保存 IPFS 根 CID、Manifest SHA-256 和逐文件 SHA-256。CID 是 UnixFS/DAG 内容地址，不能用文件 SHA-256 替代。

## 版本与不可变性

- 同一 Mission、stage、attempt 下版本号从 1 单调递增。
- 每个新版本最多有一个直接父版本；父版本必须属于同一 Mission、stage 和 attempt。
- 并发提交同一版本时只能有一个成功，另一请求返回版本冲突并要求刷新。
- 返工产生新 attempt；旧 attempt 的版本继续可见，但不得满足新 attempt 的交付就绪条件。
- 接受、拒绝和纠纷不会删除交付内容或重写 CID，只追加状态事件和冻结快照。
- 既有仅含 `uri + contentHash` 的交付物保持可读，不伪造 CID、Manifest 或版本关系。

## 验证与可用性

- Worker 使用 Worker 兼容的 CID 解析器验证 CID 格式和规范形式，不使用正则表达式假装完成 CID 校验。
- Worker 只可通过固定、受控的 IPFS Gateway 获取有大小上限的 Manifest，禁止对用户提供的任意 URL 发起服务端请求。
- 验证状态至少包括：`declared`、`verified`、`unavailable`、`hash_mismatch`、`invalid_manifest`。
- 当前 attempt 的 PinMe 交付物至少成功验证一次，才可作为新的可验证交付证据进入最终验收；暂时不可达可以重试，但哈希不匹配必须重新提交新版本。
- 已经验证的 CID 后续暂时不可达时不得改写历史验证结果；应追加可用性事件并提示 CAR/多节点备份。
- PinMe 上传历史仅作运营辅助，不能替代 D1 版本账本、事件记录和 CID 证据。

## 隐私与安全

- `public`：允许直接上传适合公开传播的交付物。
- `encrypted`：允许上传客户端预先加密的目录；Manifest 只记录加密文件哈希和密钥指纹，AgentMesh/PinMe 不保存明文密钥。
- 首版禁止把“私密”标签当作访问控制；未加密的 IPFS 内容按公开内容处理。
- 前端、日志、D1 和 Manifest 均不得保存 PinMe AppKey、身份令牌、私钥或解密密钥。
- 任何 Gateway 拉取必须限制主机、重定向、响应大小和超时，防止 SSRF 与资源耗尽。
- `pinme rm` 或取消 pin 不等于从 IPFS 网络全局删除；产品文案不得承诺可撤回或彻底删除已经公开的内容。

## 兼容与发布

- 使用新增 companion tables 保存 IPFS 证据和纠纷快照，不重建或破坏既有 `deliverables` 历史。
- 第一阶段 PinMe 证据为向后兼容增强：新 UI 默认推荐 PinMe，旧 Agent 的 HTTPS 交付仍可读取和显示为 legacy/unverified。
- 是否将 PinMe 证据设为所有新任务的强制政策，必须在 Agent 上传工具成熟后另行批准并按 Mission 固化策略版本。
- 本方案批准只授权代码实现和本地验证，不授权 `pinme save`、合约部署、外部云资源创建或资金操作。

## 验收标准

- 同一 stage/attempt 可提交至少三个不可变版本，并正确显示父子关系和最新版本。
- 旧 attempt 的 CID 不会满足返工后新 attempt 的交付要求。
- 并发版本号、跨 Mission 父版本、伪造 CID、错误 Manifest hash 和任意 URL 服务端抓取均被拒绝。
- 验收记录绑定具体交付版本；提交新版本后历史验收快照不变化。
- 纠纷冻结的 CID、Manifest hash、验收标准和工作流版本在案件生命周期内不可变。
- 公开与加密交付物有明确风险提示，任何密钥或 AppKey 不进入前端包、D1、日志或事件 payload。
- 现有交付、返工、验收、仲裁、YD 奖励、Escrow 和部署流程通过回归测试。
- 完整 backend、frontend、Worker dry-run 和关键浏览器流程通过；是否部署仍需用户单独批准。

## 不在本阶段

- 浏览器直接持有 PinMe AppKey 或调用未公开稳定的上传 API。
- AgentMesh Worker 执行本地 `pinme` CLI、依赖持久磁盘或运行子进程。
- 自动删除公开 IPFS 内容、永久可用性保证或法律存证承诺。
- R2 私有存储、Vectorize、Containers 或新的付费云资源。
- MPIN 合约部署、旧 YD 链上迁移、主网发行、交易所、跨链或真实收益。
