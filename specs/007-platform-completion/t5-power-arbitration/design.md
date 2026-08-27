# T5 Power 仲裁、上诉与执行队列设计

## 数据模型

- `dispute_proposal_rounds`：新的轮次事实表。首轮为 `round = 0`，唯一上诉为 `round = 1`；保存父提案、上诉理由/期限、权重模式和算法版本。
- `dispute_round_electorate` / `dispute_round_votes`：按提案冻结委员、Power、票权和投票。迁移会把 018 的既有提案/快照/投票复制为 round 0，旧表保留为只读兼容数据。
- `dispute_governance_events`：记录 `appeal_created`、`execution_queued` 和 `execution_executed`；既有 `dispute_actions` 继续保存原审核/结案轨迹。
- `governance_execution_queue`：以 `scope + source_id` 唯一，保存来源提案、由结果推导的动作、规范化 payload/hash、状态和人工交易信息。T5 只创建 `task_dispute` 项。

## 权重与快照

首轮管理员选择模式。`one_person_one_vote.v1` 将每个冻结委员的 `voteWeight` 设为 1；`member_power.v1` 使用 `arbitration_members.power` 的正整数快照。法定人数继续为总冻结票权的 60% 向上取整。

上诉沿用首轮模式和版本。新快照是首轮委员集合与当前活跃无冲突委员集合的并集；首轮成员即使之后停用仍保留在上诉扩大集合中，Power 使用上诉创建时的当前值，已不存在时回退首轮快照。必须至少增加一名委员。

## 上诉状态机

首轮定案时写入 `appealDeadlineAt = finalizedAt + 72h`。只有案件当事方可在期限前创建 round 1。唯一约束和 Store 条件写保证最多一次；原 proposal/electorate/votes 不更新。

执行资格：

- 存在 round 1：只接受 round 1 的 finalized outcome。
- 不存在 round 1：只在 round 0 上诉期限届满后接受其 finalized outcome。
- `inconclusive`、`quorum_failed`、`active` 或已执行状态均不可入队。

## 执行队列与私钥边界

管理员请求入队时不提交动作；Store 从最终 outcome 推导 `refund_requester` 或 `reject_dispute`，并同时验证争议/托管/提案状态。Web2 队列可由现有原子账本结算完成；Web3 队列进入 `awaiting_transaction`，由前端管理员钱包签名后提交 tx hash，Worker 只验证链上事件并封存结果。

`ecosystem` scope 和 Timelock 字段只作为 T10 的稳定接口预留；T5 没有创建 ecosystem 队列的路由，也不执行任意 payload。

## 兼容与迁移

迁移 024 使用 additive tables 和 `INSERT OR IGNORE ... SELECT` 将历史 018 数据复制为 round 0，可重复执行。API 保留 `proposal/electorate/votes/currentUser` 当前轮次视图，并新增 `rounds`、`appeal`、`execution`，旧前端字段不失效。
