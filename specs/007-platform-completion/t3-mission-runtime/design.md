# T3 任务运行控制设计

## 状态模型

`missions.status` 继续保存 `running`，避免重建已有 CHECK 约束和结算外键。`mission_runtime_controls` 保存活动暂停、scheduler revision、checkpoint sequence 和 change version；Store 在读取时派生 `Mission.status = paused`。

API 不应让派生状态泄漏到现有资金 SQL。结算仍以主表状态、escrow 状态和不可变 payout plan 为权威。

## 数据模型

- `mission_runtime_controls`：每任务一行，保存暂停信息、revision、change version、checkpoint sequence 和短期 mutation token。
- `workflow_stage_attempts`：每个 canonical stage 的 append-only attempt，保存 attempt number、run id、状态和输入/输出快照。partial unique index 保证每个 stage 只有一个 current attempt。
- `mission_change_requests`：单调版本、返工原因/验收标准、目标与后代节点、发起人和返工前 stage 快照。
- `workflow_checkpoints`：任务级 append-only 检查点，包含 schema/workflow/scheduler/change 版本与最小调度载荷，不复制敏感交付内容。

## 线性化与崩溃恢复

1. pause 使用 runtime row CAS 写入活动暂停，同一 D1 batch 写事件和 checkpoint。
2. `claimStageForDispatch` 和 `claimDispatch` 都使用 `NOT EXISTS(active pause)` 门禁。无论手动、cron 还是 builtin 递归都绕不过 Store CAS。
3. resume 使用 pause mode + revision CAS，写入 `dirty` checkpoint，然后执行幂等 reconciliation：已完成则 review，可运行 Gate 只激活一次，可运行 task 只建立一个当前 attempt outbox。成功后 checkpoint 标记 `clean`。
4. 定时器同时处理 pending outbox 和 dirty checkpoint，保证“已恢复但尚未入队”的崩溃窗口可重放。

## 返工与迟到回调

返工仅对 canonical stage 当前投影执行重置，不插入新 stage，因此结算仍每 stage 付款一次。重置前将当前 attempt 封存，为目标和受影响的后代节点创建 `attempt_no + 1`。

`createAgentDispatch` 将 run id 绑定到 current attempt。`applyAgentCallback` 除现有签名/过期/去重校验外，还要求 run 属于 current attempt。旧 attempt 的 run 即使在有效期内也不得更改当前投影。

## API

- `POST /api/missions/:id/pause`
- `POST /api/missions/:id/resume`
- `POST /api/missions/:id/change-requests`
- `GET /api/missions/:id/change-requests`

所有命令支持 `Idempotency-Key`，但数据库 CAS 才是正确性边界。Mission detail 嵌入 change requests 和 checkpoints，前端恢复或重连时不需依赖本地临时状态。
