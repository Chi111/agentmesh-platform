# DAO 仲裁投票设计

## 决策摘要

首版采用 D1 上的委员会治理，不修改现有 Escrow 合约。治理层负责“谁有权投票、提案是否定案、允许执行哪个结果”；现有结算层继续负责钱包签名、链上交易核验和 Web2 原子账本更新。

## 数据模型

### `arbitration_members`

- `user_id`：平台 Profile。
- `status`：`active | inactive`。
- `power`：当前固定为 1，保留未来治理权重。
- `appointed_by / appointed_at / updated_at`：任命审计。

### `dispute_proposals`

- 每个 dispute 首版最多一个 proposal。
- 状态：`active | succeeded | defeated | inconclusive | quorum_failed | executed`。
- `weight_mode` 固定为 `one_person_one_vote`。
- 保存投票起止时间、法定人数、快照总票权、三类票数、最终结果和执行时间。

### `dispute_electorate`

- 创建提案时冻结 `user_id`、`power_snapshot` 和 `vote_weight`。
- 首版 `vote_weight=1`；后续 Power 模式可改为 `power_snapshot`，不需要改变投票表。

### `dispute_votes`

- 唯一键 `(proposal_id, voter_id)` 保证一人一票。
- 保存 `choice`、理由、计票权重和时间。

## 生命周期

```text
open dispute
  -> admin starts review
  -> active proposal + electorate snapshot
  -> members cast immutable votes
  -> succeeded / defeated / quorum_failed
  -> admin executes matching settlement
  -> executed + dispute resolved/rejected
```

定案函数统一计算：

1. `participated = support + oppose + abstain`。
2. `quorumReached = participated >= quorumRequired`。
3. 全员已投、截止时间已到，或某一结果已不可逆时允许定案。
4. 法定人数未达到且截止时间已到：`quorum_failed`。
5. 法定人数达到且支持票严格大于反对票：`succeeded`；反对票严格大于支持票：`defeated`；否则 `inconclusive`。

## 利益冲突

提案快照排除：

- mission requester；
- dispute opener；
- 所有被分配到该 mission 的 Agent owner。

成员在提案创建后的任命、停用或 Power 修改不追溯影响现有提案。

## API

- `GET /api/arbitration/members`：管理员读取委员会配置。
- `PUT /api/arbitration/members/:userId`：管理员任命或停用成员。
- `GET /api/disputes/:id/governance`：返回提案、投票、快照资格和当前用户动作权限。
- `POST /api/disputes/:id/review`：兼容旧端点，同时创建或返回提案。
- `POST /api/disputes/:id/votes`：提交不可修改的投票。
- `POST /api/disputes/:id/finalize`：截止后定案；投票提交也会尝试提前定案。
- `POST /api/disputes/:id/resolve`：保留结算协议，但增加提案状态和结果匹配校验。

## UI

- 仲裁中心采用治理提案布局，而非后台表格：案件导航、提案状态、倒计时、法定人数进度、票数分布、证据、投票理由和执行轨迹。
- 合格投票人看到三个明确选项及理由输入；非投票人看到只读解释。
- 只有定案后管理员才看到与结果一致的“执行裁决”按钮。
- 平台运营页在成员表中增加“仲裁委员”开关和 Power 1 展示。

## 安全与并发

- 所有资格和结果由 Worker + D1 校验，前端状态不构成授权。
- 投票唯一约束、状态条件更新和结算 guard 防止重复投票、截止竞态和重复退款。
- `resolve` 在同一存储边界验证提案结果并将 proposal 标记 executed。
- 所有自由文本按普通数据处理，不写入密钥或模型原始响应。

## 测试策略

- 存储：成员快照、利益回避、重复票、法定人数、平票、提前定案、过期定案、执行匹配和并发幂等。
- Worker：管理员权限、委员权限、非快照拒绝、旧争议初始化和 Web3 结算保护。
- 前端：加载/空/错误/只读/可投票/已投票/待执行/已执行状态，以及移动端布局。
