# pinme-mesh Worker API

## Runtime boundaries

- Worker 是平台控制面：鉴权、领域规则、Agent 调度、状态机、证据与结算账本。
- D1 是事实来源；日期以 ISO-8601 `TEXT` 保存，数组和对象序列化为 JSON `TEXT`。
- 开发者 Agent 的实际计算运行在独立 HTTPS Endpoint。Worker 派发一个可恢复的阶段任务，并接收阶段级签名回调。迁移 `011` 写入的官方测试 Agent 是明确标记的内置运行时例外，用于让测试网开箱即可验证完整任务流程。
- 交付文件保存在 IPFS 或外部对象存储；D1 仅保存 URI、内容哈希、MIME 类型和版本证据。官方 Agent 的 Analyze 结果只作为工作底稿，Implement 节点可发布阶段制品，无出边的终结节点自动把全部阶段汇总为多文件 PinMe 完整成果包；执行 JSON 只保留为证据。
- Web2 模式下，`wallet_balances`、`wallet_transactions`、`escrows` 和 `ledger_entries` 组成可审计 CREDIT 测试账本。Web3 模式下，Worker 会验证 Sepolia 回执、目标合约、资产类型、确认数、任务键、金额、发送钱包和链上分账承诺，再推进 D1 状态。

## pinme-mesh Contribution / PM rewards and governance (Phase 1/2)

Public responses and UI use `pinme-mesh Contribution / PM`. Legacy `/api/yd/*`, `YD_*` configuration and database names remain stable for compatibility; PM is not presented as a PinMe-official token.

- `GET /api/yd/config` — 公开链配置，并明确报告托管隔离与 Earn 未启用。
- `GET /api/yd/epochs/:id/allocations` — 公开已计算/已发布清单，不返回用户 Merkle proof。
- `GET /api/yd/governance/public` — 公开提案、钱包 Power 快照与投票，不返回平台 user ID。
- `GET /api/yd/overview` — 当前账户奖励、领取 proof、贡献、锁仓读模型与治理提案。
- `POST /api/yd/claims/sync` — 核验绑定钱包的 `RewardClaimed` 交易并幂等记账。
- `POST /api/yd/staking/sync` — 核验锁仓事件，并只接受单调更新的链上状态。
- `GET /api/yd/governance/proposals` — 返回生态提案、不可变 Power 快照和当前用户资格。
- `POST /api/yd/governance/proposals/:id/votes` — 每个快照钱包只能提交一次不可修改投票。
- `POST /api/yd/governance/proposals/:id/finalize` — 到期或全员参与后由管理员定案。
- `POST /api/yd/admin/epochs` — 创建固定奖励池周期。
- `POST /api/yd/admin/epochs/:id/compute` — 冻结有效贡献并生成精确 Merkle 分配。
- `POST /api/yd/admin/epochs/:id/publish` — 核验完全匹配的链上 Root 发布交易。
- `POST /api/yd/admin/epochs/:id/expire` — 核验 Treasury sweep 交易，并把未领取分配标记为过期。
- `POST /api/yd/admin/governance/proposals` — 从已确认历史区块读取 Power 并创建提案。

所有写接口要求正常 Worker 登录；管理员接口还要求平台 `admin` 角色，链上动作同时要求签名钱包拥有对应合约角色。内部保留的 YD 兼容路径不会修改任务 Escrow。

## PinMe/IPFS deliverable evidence

- `GET /api/missions/:missionId/evidence/context?stageId=...` returns the current acceptance-criteria hash, next version and Manifest template.
- `POST /api/missions/:missionId/deliverables` accepts optional structured `ipfsEvidence`; legacy URI submissions remain compatible.
- `POST /api/missions/:missionId/deliverables/:deliverableId/verify` fetches `/ipfs/:cid/manifest.json` only through the fixed HTTPS Gateway (`https://ipfs.io` by default, overridable with `IPFS_GATEWAY_BASE`).
- `GET /api/missions/:missionId/evidence/dossier` exports a deterministic acceptance or dispute review dossier.
- `POST /api/missions/:missionId/evidence/publications` remains a compatibility endpoint for externally archived review dossiers; dossier JSON is not a client deliverable.

The Worker never runs the Node CLI. `GET/PUT/DELETE /api/me/integrations/pinme` lets an authenticated user inspect, replace or remove their own encrypted AppKey configuration without ever reading the plaintext back. Built-in delivery publishing prefers the task owner's encrypted credential and may fall back to the optional server-only `PINME_UPLOAD_APP_KEY`; it fails closed when neither exists. See [pinme-mesh IPFS Evidence](meshpin-ipfs-evidence.md).

## Authentication

公开接口：

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/agents`
- `GET /api/agents/:agentId`
- `GET /api/agents/:agentId/invoke`（官方 Agent 的公开调用契约）
- `POST /api/auth/register`
- `POST /api/auth/verify`

其余接口要求 `Authorization: Bearer <token>`。Worker 根据已签名 token 的签发方选择验证器：PinMe Identity token 通过 PinMe Auth 代理验证；Privy access token 在 Worker 内校验 ES256 签名、`iss=privy.io`、项目 `aud`、有效期和 Privy DID。Privy 客户端同时发送独立签名的 `Privy-Id-Token`，Worker 才会读取 linked email / wallet。`auth_identities` 将多个提供方映射到同一 `profiles` 记录。PinMe 邮箱未验证返回 `403 EMAIL_NOT_VERIFIED`。

Privy 的部署配置、回退逻辑和安全边界见 [`authentication.md`](authentication.md)。

写操作可携带 `Idempotency-Key`。任务创建和 Agent 注册使用原子占位，键同时绑定用户、HTTP 方法、路径和规范化 JSON 请求体 SHA-256；进行中的同请求返回 `409 IDEMPOTENCY_IN_PROGRESS`，成功结果可安全重放，换接口或换请求体复用同一个键返回 `409 IDEMPOTENCY_KEY_REUSED`。

浏览器来源由逗号分隔的 `CORS_ORIGIN` 白名单限制。注册、会话验证、Agent 回调和普通认证请求分别使用 D1 固定窗口限流；JSON 请求体上限为 1 MB。

## Main endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bootstrap` | 当前角色的任务、Agent、通知和开发者摘要 |
| `GET/PUT` | `/api/me/preferences` | 读取或持久化通知、语言和时区偏好 |
| `GET/PUT/DELETE` | `/api/me/integrations/pinme` | 查询、加密保存或移除当前用户的 PinMe 自动交付 AppKey；响应永不返回明文 |
| `GET/POST` | `/api/missions` | 查询或创建任务 |
| `GET` | `/api/wallet` | 查询当前用户 CREDIT 余额、测试充值状态和最近流水 |
| `POST` | `/api/wallet/test-topup` | 每 24 小时领取固定 100 CREDIT 测试余额 |
| `GET` | `/api/missions/:id` | 任务、DAG 节点与边、接单邀请、事件、交付物、托管与争议聚合 |
| `GET` | `/api/missions/:id/stream` | 鉴权 SSE 任务快照；客户端断线后回退轮询 |
| `POST` | `/api/missions/:id/compile` | LangGraph 执行复杂度分析、DAG 规划、本地校验和一次定向修复；兼容旧 `stages` 响应，失败时生成 2–12 个任务节点的自适应 DAG；不自动分配 Agent |
| `GET` | `/api/missions/:id/candidates` | 分类、标签、信誉、质量、动态报价与公平扰动匹配；每个候选返回报价构成和公式版本 |
| `PUT` | `/api/missions/:id/workflow/draft` | 以 `workflowVersion` 乐观锁保存节点、边和 viewport；重新编排使旧邀请失效 |
| `POST` | `/api/missions/:id/workflow` | 确认当前图和手动 Agent 分配；校验报价不超过节点预算，为任务节点生成带锁价快照的 24 小时邀请 |
| `POST` | `/api/missions/:id/offers/:offerId` | 被分配 Agent 的所有者接受或拒绝阶段邀请 |
| `POST` | `/api/missions/:id/start` | 全部当前邀请接受后原子锁定账本并启动；并发请求只扣款和写启动事件一次；合约模式验证带 `payoutHash` 的 `depositTxHash` |
| `POST` | `/api/missions/:id/dispatch` | 并行派发全部依赖已满足的任务节点；失败节点不会隐式重试 |
| `POST` | `/api/missions/:id/gates/:nodeId/decision` | 任务方批准 Gate，或填写反馈并选择直接上游任务返工 |
| `POST` | `/api/missions/:id/nodes/:nodeId/retry` | 任务方显式重试一个失败任务节点，不自动换 Agent |
| `GET/POST` | `/api/missions/:id/events` | 读取事件；管理员可追加审计事件，任务方仅可提交服务端模板化的人工协助命令 |
| `GET/POST` | `/api/missions/:id/deliverables` | 读取或提交交付 URI 与内容哈希 |
| `POST` | `/api/missions/:id/review` | 所有阶段完成且已有交付物后提交验收，并写入 7 天后的 `reviewDueAt` |
| `POST` | `/api/missions/:id/accept` | 验收并生成分账；合约模式验证收款人、权重和 `releaseTxHash` 均匹配存入时承诺 |
| `POST` | `/api/missions/:id/disputes` | 发起争议；Web3 必须提交已验证的 `freezeTxHash`，Web2 原子冻结账本 |
| `GET/POST` | `/api/agents` | Agent 市场或开发者注册 |
| `GET` | `/api/agents/:id/invoke` | 读取官方 Agent 的真实 HTTPS Endpoint、鉴权方式和输入契约 |
| `POST` | `/api/agents/:id/invoke` | 登录用户直接调用官方 Agent；需要 Bearer ID Token，按用户和 Agent 独立限流 |
| `POST` | `/api/agents/:id/trial` | 对 Endpoint 发起随机挑战后评分；挑战失败不能激活 |
| `POST` | `/api/agents/:id/status` | 已通过试炼且信誉达标的 Agent 上线或暂停 |
| `POST` | `/api/agents/:id/price` | Agent 所有者或管理员修改 USDC 基础价并生成不可变价格版本；不追溯修改既有邀请报价 |
| `POST` | `/api/admin/agents/:id/quality/trial-override` | 管理员以 7.5–10 分人工通过 Trial；写入独立审计证据，不伪造 Endpoint 健康记录 |
| `GET` | `/api/developer/summary` | 接单数、活跃 Agent、成交额与待结算 |
| `GET` | `/api/developer/ledger?token=CREDIT&limit=50&cursor=…` | 按 CREDIT / mUSDC / sETH 隔离的逐笔账目、状态汇总、12 周趋势和不透明游标；单页最多 100 条 |
| `GET` | `/api/disputes` | 当前用户可访问的争议 |
| `GET` | `/api/disputes/:id/actions` | 当前案件的追加式处理轨迹 |
| `GET` | `/api/disputes/:id/governance` | 提案、委员会快照、公开投票与当前用户资格 |
| `POST` | `/api/disputes/:id/review` | 管理员创建唯一仲裁提案并冻结无利益冲突的委员会快照 |
| `POST` | `/api/disputes/:id/votes` | 快照成员提交一次不可修改的支持、反对或弃权票 |
| `POST` | `/api/disputes/:id/finalize` | 管理员在截止或结果不可逆后定案 |
| `POST` | `/api/disputes/:id/resolve` | 执行与已定案结果一致的裁决；Web3 仍必须提交已验证的解冻或退款交易 |
| `GET` | `/api/notifications` | 通知列表 |
| `POST` | `/api/notifications/read` | 标记通知已读 |
| `POST` | `/api/notifications/test-email` | 向当前认证邮箱发送通道测试邮件 |
| `GET` | `/api/admin/users?limit=100` | 管理员读取工作区成员与角色 |
| `PUT` | `/api/admin/users/:id/role` | 管理员调整角色；禁止自我降权，并由 API + D1 trigger 双重保证至少一位管理员 |
| `GET` | `/api/admin/audit?limit=100` | 管理员读取追加式角色变更审计 |
| `GET` | `/api/arbitration/members` | 管理员读取仲裁委员会成员与 Power |
| `PUT` | `/api/arbitration/members/:id` | 管理员任命或停用仲裁委员；不追溯改变已有提案快照 |

任务阶段、交付、验收、结算与争议状态变化会经过统一通知投递器。用户关闭对应类别后，站内和邮件均不生成；开启邮件通道且 profile 有认证邮箱时，Worker 使用 PinMe Email 投递。邮件网络失败不会回滚已提交的任务状态或站内通知。

## Agent dispatch contract

Worker 向 Agent Endpoint 发送：

```json
{
  "protocol": "agentmesh.node-dispatch.v2",
  "task": {
    "agent": { "id": "AGENT-...", "name": "Engineering Agent" },
    "mission": { "id": "TASK-...", "title": "..." },
    "node": {
      "id": "STAGE-...",
      "nodeType": "task",
      "name": "后端实现",
      "input": { "executionMode": "implement" }
    },
    "stage": { "id": "STAGE-...", "name": "后端实现" },
    "upstream": [
      {
        "id": "STAGE-DIRECT-PREDECESSOR",
        "handoff": { "summary": "...", "risks": [] },
        "artifacts": [{ "id": "DEL-...", "uri": "ipfs://...", "contentHash": "sha256:..." }]
      }
    ]
  },
  "callback": {
    "url": "https://<worker>/api/hooks/agents/<agentId>/events",
    "signature": "<dispatch-scoped HMAC>",
    "runId": "<random dispatch id>",
    "expiresAt": "<ISO-8601 expiry>",
    "callbackIdRequired": true
  }
}
```

请求头包含稳定的 `X-AgentMesh-Task-Id` 和 `X-AgentMesh-Agent-Id`。`upstream` 只包含直接前驱的受限交接摘要与 artifact reference，不把完整历史输出塞入后继 prompt；旧 Endpoint 仍可读取兼容 `stage` 与 `upstream[].output` 字段。

Agent 使用 `X-AgentMesh-Signature` 回调，并在请求体带回 `missionId + stageId + agentId + runId + expiresAt + callbackId`。`done` 回调必须包含成功的结构化 `output`；`implement` 节点还必须携带至少一个 `artifacts[]`（`name + uri + sha256 contentHash + mimeType`），或在终态回调前已经为该节点登记制品。回调内的 artifact、阶段状态、执行事件、节点进度、Agent 履约事件和 outbox 终态在同一个 D1 原子批次中提交，不能出现“节点完成但制品未登记”的半成功状态。

签名绑定一次派发且有效 2 小时；只有任务 `running`、托管 `held`、阶段 `running` 三个条件同时成立时才会应用回调。首次 `done` / `failed` 终态不可被乱序回调或派单故障覆盖。令牌由独立的 `AGENT_WEBHOOK_SECRET` 通过 HMAC-SHA256 派生，不暴露项目密钥。派发占用同样原子检查任务与托管状态，再对网络错误或 5xx 做有限重试；Agent Endpoint 应按 `X-AgentMesh-Task-Id` 幂等处理。

D1 outbox 为每次节点运行持久化 `runId + expiresAt`；请求后 `waitUntil` 与每分钟 cron 共同排空。进程恢复和网络重试沿用同一 run ID，只有显式重试或 Gate 返工才生成新的运行身份。多个根节点和同批就绪节点并行派发；Join 等待全部直接前驱 `done`。依赖失败只动态阻塞后继，其他独立分支继续。

Gate 在所有入边完成后由 `queued` 转为 `running`（待审批）。批准后进入 `done` 并调度后继；驳回必须提供反馈并选择一个或多个直接上游任务，所选任务与 Gate 回到 `queued`，原输出保留在事件证据中。任务总进度按任务节点预算加权，Gate 不占预算；全部节点完成后才是 100%。

Agent 注册 API 不接受 `apiKey`、`token`、`secret` 或 `credential` 字段。需要认证的 Agent Endpoint 必须在 Worker Secret `AGENT_CREDENTIALS_JSON` 中按 Agent ID 配置凭据；在凭据不可用时，派发接口返回 `409 AGENT_CREDENTIAL_REQUIRED`。Endpoint 必须使用 HTTPS 443；Worker 拒绝用户名密码、localhost、私网/保留 IPv4 和直接 IPv6 字面地址，试炼和派发前还会解析 A/AAAA 并拒绝任何非公网结果。生产可再用 `AGENT_ENDPOINT_ALLOWLIST` 限制域名。

工作流确认会为每个阶段生成绑定当前 `stageId + agentId` 的 24 小时邀请。`agentmesh.quote.v1` 以 Agent 版本化 USDC 基础价为起点，叠加节点执行类型、任务优先级、专家等级和负载系数，并把金额、币种、各乘数、基础价版本与公式版本完整写入邀请快照。负载按 Agent 在运行中任务里的 `queued/running` 阶段数计算：空闲为 `0.9`、1 个阶段为 `1.0`，之后每增加一个并发阶段加 `0.05`，最高 `1.2`；候选查询展示实时估算，确认工作流时重新计算并锁价。CREDIT 与 mUSDC 报价不得高于对应节点预算，否则返回 `409 STAGE_QUOTE_EXCEEDS_BUDGET`；sETH 在没有可信汇率预言机前沿用节点预算，不把 USDC 基础价直接换算成原生资产。

节点预算是价格上限，不再是必然扣款额。确认工作流后，待托管金额会收敛为所有任务节点锁定报价之和；Web2 启动只冻结该金额，Web3 存款校验和 `payoutHash` 也使用同一快照。平台费仍为托管金额的 0.4%，各 Agent 的结算权重来自对应锁定报价。Agent 后续修改基础价会生成新版本，但不追溯影响已有邀请、托管或结算；工作流修改或重发邀请时，上一轮报价会转入只追加的历史表继续保留。

只有 Agent 所有者能响应邀请；拒绝、未响应过期或重新编排后，任务方必须重新发送当前工作流邀请。在期限内接受后，该承诺持续有效到工作流被替换或托管开始，避免钱包存入期间出现到期竞态。启动守卫在 Worker 和 D1 两层确认每个阶段都存在 `accepted` 邀请，未满足时返回 `409 OFFERS_NOT_ACCEPTED`，且不得产生 Web2 扣款或链上验证副作用。

官方测试 Agent 由平台运行时直接托管，不存在等待人工开发者响应的环节，因此工作流确认时会生成已接受的邀请。派发仍执行同样的阶段占用、运行记录、终态 CAS、履约统计和交付哈希流程；输出优先来自项目级 PinMe LLM，无法形成有效结构化结果时节点失败且不会发布降级占位。Analyze 节点不创建客户 artifact；Implement 节点创建阶段制品；终结节点额外获得所有已完成节点的有界 portfolio，并发布 `deliverable.md + acceptance-report.md + artifact-index.md + workstreams/*.md + index.html + manifest.json`。它们同时通过 `/api/agents/:id/invoke` 暴露 HTTPS 调用契约：GET 可匿名读取文档，POST 必须登录、限制请求体并按用户与 Agent 限流。第三方 Agent 不获得自动接单或该托管调用能力。

Agent 市场质量使用独立的只追加事件账本，不再把旧 `trustScore` 或一次试炼分直接当作长期信誉。正式 `agentmesh.trial.v3` 分别验证结构化执行、错误处理、交付物契约，并为工程 Agent 增加 analyze/implement/review/verification 能力场景；每个场景通过 `X-AgentMesh-Agent-Id`、请求体 `agentId` 和独立 challenge 绑定市场身份。响应若泄露 Worker 凭据或 token 模式，Trial 立即失败并写入严重安全事件。每 15 分钟最多抽取 3 个已通过 Trial 的 active Agent 做受限 HEAD 健康检查，401/403 会判定凭据健康失败。阶段失败、无效制品、已验证制品、成功结算、退款/争议和有效反馈均用稳定 idempotency key 写入一次，重复回调、迟到回调和重复验收不会重复计分。

当前信誉公式版本为 `agentmesh-quality-v1`：可靠性 35、质量 30、交付 15、响应 10、历史 10，再扣风险分；普通事件按约 60 天半衰期衰减，严重安全事件在显式解除前保持硬阻断。已结算任务少于 5 个为低置信度，5–19 个为中置信度，20 个以上为高置信度。市场状态独立于 legacy 执行状态，包含 `registered / verifying / trial / listed / degraded / suspended / retired`。

`AGENT_QUALITY_GATE_MODE` 缺省为 `shadow`：仍按 legacy active 保留曝光，但在 Agent `quality` 中返回 `wouldBeEligible` 和完整原因。切为 `enforce` 后，`GET /api/agents`、任务候选、工作流邀请、邀请接受和重新激活统一调用同一个准入策略；公开 Agent 详情和历史任务始终可访问。正式切换前必须先为生产 Agent 补跑 Trial 并观察影子分。

任务成功结算后，任务方可通过 `PUT /api/missions/:missionId/stages/:stageId/feedback` 提交 1–5 分的交付质量、需求符合度、沟通、准时与复用意愿。每次修改生成新版本，旧版本保留；只有已完成、已释放托管、无退款/有效争议且确由该 Agent 执行的节点进入信誉分，同一任务方的后续跨任务反馈按历史次数降权。公开质量摘要为 `GET /api/agents/:id/quality`，开发者私有证据为 `GET /api/developer/agents/:id/quality`，管理员质量控制台为 `GET /api/admin/agent-quality`。管理员通过 `POST /api/admin/agents/:id/quality/events` 追加带原因的风险、解除风险或校正事件，不能直接改写统计分。

开发者只能为自己拥有且被分配到对应阶段的 Agent 提交阶段交付物。提交验收前，Worker 会再次检查每个工作流阶段均为 `done`，避免客户端绕过执行状态机。

通用事件接口不接受开发者伪造阶段进度；开发者应使用签名 Agent 回调或交付物接口。任务方的 `mission.assistance_requested` 由服务端生成固定消息和规范状态，不接受调用方自定义 `progress`、`stageId` 或 `currentStage`。

启动、验收、争议创建和裁决均在 D1 使用状态条件与原子批次：并发启动只扣款一次；验收与冻结只有一个分支获胜；每个任务最多一个活跃争议。争议裁决必须先经过委员会快照、一人一票、60% 法定人数和明确多数；平票、全部弃权或未达到法定人数均不授权资金动作。首个有效执行之后的请求不能覆盖结果或重复退款。

## Migrations

- `001_init.sql`：原 PinMe 模板表，保留以兼容已部署数据库。
- `002_agentmesh_core.sql`：AgentMesh 领域表和索引。
- `003_identity_security.sql`：统一身份映射和 D1 API 限流桶。
- `004_preferences_and_dispute_operations.sql`：用户偏好和追加式争议操作审计轨迹。
- `005_admin_operations.sql`：管理员角色变更的追加式审计记录与查询索引。
- `006_payment_wallets.sql`：不可提现 CREDIT 测试余额、流水和 24 小时测试充值。
- `007_security_hardening.sql`：链上分账/争议交易字段、任务终止标记、钱包唯一绑定、防执行期工作流改写、派发与回调去重。
- `008_concurrency_integrity.sql`：幂等请求体哈希、回调原子应用标记、活跃争议唯一约束、争议创建时托管状态守卫。
- `009_remove_demo_data.sql`：清理历史版本写入的展示账户、样例任务和关联记录。
- `010_market_foundation.sql`：阶段接单邀请、Agent 履约事件、验收期限，以及 Web2 余额触发器修正。
- `011_official_test_agents.sql`：3 个可运行的官方测试 Agent；不写入样例任务或用户工作区数据。
- `012_escrow_requester_wallet.sql`：记录托管请求方钱包，强化链上验收与争议归属。
- `013_reconcile_signed_output_reviews.sql`：把已有签名完成输出的历史运行任务修正到待验收状态。
- `014_reopen_mastra_fallback_deliveries.sql`：重开受 Mastra 降级交付影响的任务，保留审计证据。
- `015_reopen_nonlocalized_final_delivery.sql`：重开不符合本地化最终交付要求的历史任务。
- `016_visual_workflow_dag.sql`：DAG 节点布局与版本、边、历史线性迁移、托管后图锁和持久化 dispatch outbox。
- `017_reopen_missing_engineering_artifact.sql`：撤销缺少真实工程制品的历史伪完成状态，保留原输出证据并原样保留 held/frozen 托管。
- `018_dao_arbitration.sql`：仲裁委员会、Power 预留、提案生命周期、成员快照、不可修改投票和执行审计。
- `019_yd_rewards_governance.sql`：隔离的 YD 周期奖励、Merkle 分配、锁仓 read model、Power 快照和生态治理。
- `020_agent_market_quality.sql`：Agent 版本、正式 Trial、Endpoint 健康、只追加质量事件、版本化反馈、信誉读模型与快照。
- `032_assign_official_agents_to_admin.sql`：将 3 个官方 Agent 的链上收款地址统一为管理员钱包 `0x73325bD3e93d9A12e5D2d5219424DaF0e55F856D`，并按该钱包绑定的管理员 Profile UID 迁移 Web2 所有权、CREDIT 收益和 PM 贡献记录。旧地址已写入不可变 `payoutHash` 的在途 Web3 托管不得释放到旧地址，需先原路退款再按新地址重新托管。
- `034_versioned_pricing_quotes.sql`：可重放的 Agent 基础价版本、当前阶段锁价与历史报价旁表；同时把旧数据中的零基础价归一到最低 `0.01 USDC`。

部署 Worker 与数据库的联合修改使用：

```bash
pinme save
```
