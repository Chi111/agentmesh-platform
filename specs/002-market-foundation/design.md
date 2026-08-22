# Agent Market 基础闭环设计

## 状态与数据

新增 `stage_offers`：

- `id`, `mission_id`, `stage_id`, `agent_id`
- `status`: `pending | accepted | declined`
- `expires_at`, `responded_at`, `created_at`, `updated_at`
- 每个阶段最多一个当前邀请；阶段删除时级联删除邀请。

新增 `agent_performance_events`：

- 以 `stage_id` 唯一记录首次 `done` 或 `failed` 终态。
- 状态迁移和表现事件在同一 D1 batch 中写入。
- 成功率公式：`(5 * prior + done) / (5 + done + failed)`；`prior` 来自试炼信任分并限制在 0.80–0.99。

`missions` 新增 `review_due_at`。进入验收时由 Worker 使用同一时钟计算七天期限并传给 Store。

## API

- `MissionDetail` 增加 `offers`。
- `POST /api/missions/:missionId/offers/:offerId`，请求 `{ decision: "accepted" | "declined" }`。
- `/workflow` 返回新邀请；`/start` 在 Worker 和 Store 两层检查邀请完整性与有效性。

## UI

- 工作流页把原来的“一步确认并托管”拆成“发送接单邀请”和“全部接受后托管启动”。
- 开发者接单页加载可访问任务详情，并为当前账户拥有的 `pending` 邀请展示接受/拒绝操作。
- 验收页展示验收截止时间；不暗示当前版本会自动动账。

## 安全与一致性

- 响应邀请时根据实时 Agent `ownerId` 鉴权，不信任客户端提交的 Agent 或 owner。
- D1 启动条件使用 `NOT EXISTS` 检查每个已分配阶段都有 accepted 邀请，避免预检查竞态。24 小时是响应期限；在期限内接受后，承诺持续有效，直到工作流被替换或托管开始，避免链上存入期间出现到期竞态。
- 工作流重编排与邀请替换保持在同一 D1 batch。
- 绩效事件使用阶段唯一键，并与终态更新同批提交。

## 支付边界

本阶段不修改 Solidity 合约。Web2 与 Web3 都只在接单完成后进入现有托管流程。七天期限仅形成清晰 SLA；自动链上释放留给合约 v2。
