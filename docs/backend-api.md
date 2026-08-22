# AgentMesh Worker API

## Runtime boundaries

- Worker 是平台控制面：鉴权、领域规则、Agent 调度、状态机、证据与结算账本。
- D1 是事实来源；日期以 ISO-8601 `TEXT` 保存，数组和对象序列化为 JSON `TEXT`。
- 开发者 Agent 的实际计算运行在独立 HTTPS Endpoint。Worker 派发一个可恢复的阶段任务，并接收阶段级签名回调。迁移 `011` 写入的官方测试 Agent 是明确标记的内置运行时例外，用于让测试网开箱即可验证完整任务流程。
- 交付文件保存在 IPFS 或外部对象存储；D1 仅保存 URI、内容哈希和 MIME 类型。
- Web2 模式下，`wallet_balances`、`wallet_transactions`、`escrows` 和 `ledger_entries` 组成可审计 CREDIT 测试账本。Web3 模式下，Worker 会验证 Sepolia 回执、目标合约、资产类型、确认数、任务键、金额、发送钱包和链上分账承诺，再推进 D1 状态。

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
| `GET/POST` | `/api/missions` | 查询或创建任务 |
| `GET` | `/api/wallet` | 查询当前用户 CREDIT 余额、测试充值状态和最近流水 |
| `POST` | `/api/wallet/test-topup` | 每 24 小时领取固定 100 CREDIT 测试余额 |
| `GET` | `/api/missions/:id` | 任务、阶段、接单邀请、事件、交付物、托管与争议聚合 |
| `GET` | `/api/missions/:id/stream` | 鉴权 SSE 任务快照；客户端断线后回退轮询 |
| `POST` | `/api/missions/:id/compile` | PinMe LLM 编译任务；失败时确定性降级 |
| `GET` | `/api/missions/:id/candidates` | 分类、标签、信誉、质量、价格与公平扰动匹配 |
| `POST` | `/api/missions/:id/workflow` | 确认阶段与 Agent 分配，替换旧邀请并生成 24 小时阶段邀请 |
| `POST` | `/api/missions/:id/offers/:offerId` | 被分配 Agent 的所有者接受或拒绝阶段邀请 |
| `POST` | `/api/missions/:id/start` | 全部当前邀请接受后原子锁定账本并启动；并发请求只扣款和写启动事件一次；合约模式验证带 `payoutHash` 的 `depositTxHash` |
| `POST` | `/api/missions/:id/dispatch` | 将下一个可运行阶段派发至开发者 Endpoint，或执行官方测试 Agent 的内置 PinMe LLM 运行时 |
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
| `GET` | `/api/developer/summary` | 接单数、活跃 Agent、成交额与待结算 |
| `GET` | `/api/developer/ledger?token=CREDIT&limit=50&cursor=…` | 按 CREDIT / mUSDC / sETH 隔离的逐笔账目、状态汇总、12 周趋势和不透明游标；单页最多 100 条 |
| `GET` | `/api/disputes` | 当前用户可访问的争议 |
| `GET` | `/api/disputes/:id/actions` | 当前案件的追加式处理轨迹 |
| `POST` | `/api/disputes/:id/review` | 管理员接手公开案件并进入审核 |
| `POST` | `/api/disputes/:id/resolve` | 管理员裁决；Web3 必须提交已验证的解冻或退款交易 |
| `GET` | `/api/notifications` | 通知列表 |
| `POST` | `/api/notifications/read` | 标记通知已读 |
| `POST` | `/api/notifications/test-email` | 向当前认证邮箱发送通道测试邮件 |
| `GET` | `/api/admin/users?limit=100` | 管理员读取工作区成员与角色 |
| `PUT` | `/api/admin/users/:id/role` | 管理员调整角色；禁止自我降权，并由 API + D1 trigger 双重保证至少一位管理员 |
| `GET` | `/api/admin/audit?limit=100` | 管理员读取追加式角色变更审计 |

任务阶段、交付、验收、结算与争议状态变化会经过统一通知投递器。用户关闭对应类别后，站内和邮件均不生成；开启邮件通道且 profile 有认证邮箱时，Worker 使用 PinMe Email 投递。邮件网络失败不会回滚已提交的任务状态或站内通知。

## Agent dispatch contract

Worker 向 Agent Endpoint 发送：

```json
{
  "task": {
    "mission": { "id": "TASK-..." },
    "stage": { "id": "STAGE-...", "status": "queued" }
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

Agent 使用 `X-AgentMesh-Signature` 回调，并在请求体带回 `missionId + stageId + agentId + runId + expiresAt + callbackId`。签名绑定一次派发且有时效；只有任务 `running`、托管 `held`、阶段 `running` 三个条件同时成立时才会应用回调。`callbackId` 占用、阶段 CAS、执行事件、单调进度和派发终态在同一个 D1 原子批次中提交，任一步失败都会整体回滚。首次 `done` / `failed` 终态不可被乱序回调或派单故障覆盖。令牌由独立的 `AGENT_WEBHOOK_SECRET` 通过 HMAC-SHA256 派生，不暴露项目密钥。派发占用同样原子检查任务与托管状态，再对网络错误或 5xx 做有限重试；Agent Endpoint 应按 `X-AgentMesh-Task-Id` 幂等处理。

Agent 注册 API 不接受 `apiKey`、`token`、`secret` 或 `credential` 字段。需要认证的 Agent Endpoint 必须在 Worker Secret `AGENT_CREDENTIALS_JSON` 中按 Agent ID 配置凭据；在凭据不可用时，派发接口返回 `409 AGENT_CREDENTIAL_REQUIRED`。Endpoint 必须使用 HTTPS 443；Worker 拒绝用户名密码、localhost、私网/保留 IPv4 和直接 IPv6 字面地址，试炼和派发前还会解析 A/AAAA 并拒绝任何非公网结果。生产可再用 `AGENT_ENDPOINT_ALLOWLIST` 限制域名。

工作流确认会为每个阶段生成绑定当前 `stageId + agentId` 的 24 小时邀请。只有 Agent 所有者能响应；拒绝、未响应过期或重新编排后，任务方必须重新发送当前工作流邀请。在期限内接受后，该承诺持续有效到工作流被替换或托管开始，避免钱包存入期间出现到期竞态。启动守卫在 Worker 和 D1 两层确认每个阶段都存在 `accepted` 邀请，未满足时返回 `409 OFFERS_NOT_ACCEPTED`，且不得产生 Web2 扣款或链上验证副作用。

官方测试 Agent 由平台运行时直接托管，不存在等待人工开发者响应的环节，因此工作流确认时会生成已接受的邀请。派发仍执行同样的阶段占用、运行记录、终态 CAS、履约统计和交付哈希流程；输出优先来自项目级 PinMe LLM，失败时使用带来源标记的确定性降级结果。它们同时通过 `/api/agents/:id/invoke` 暴露 HTTPS 调用契约：GET 可匿名读取文档，POST 必须登录、限制请求体并按用户与 Agent 限流。第三方 Agent 不获得自动接单或该托管调用能力。

Agent 成功率不再直接复制试炼分。平台为每个阶段只记录一次首次 `done` / `failed` 终态，以试炼信任分作为 5 次观测的冷启动先验，计算贝叶斯平滑成功率。重复回调、迟到回调和终态覆盖不会重复计数。

开发者只能为自己拥有且被分配到对应阶段的 Agent 提交阶段交付物。提交验收前，Worker 会再次检查每个工作流阶段均为 `done`，避免客户端绕过执行状态机。

通用事件接口不接受开发者伪造阶段进度；开发者应使用签名 Agent 回调或交付物接口。任务方的 `mission.assistance_requested` 由服务端生成固定消息和规范状态，不接受调用方自定义 `progress`、`stageId` 或 `currentStage`。

启动、验收、争议创建和裁决均在 D1 使用状态条件与原子批次：并发启动只扣款一次；验收与冻结只有一个分支获胜；每个任务最多一个活跃争议；首个裁决之后的请求不能覆盖结果或重复退款。

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
- `011_official_test_agents.sql`：3 个可运行的官方测试 Agent 及其系统所有者；不写入样例任务或用户工作区数据。

部署 Worker 与数据库的联合修改使用：

```bash
pinme save
```
