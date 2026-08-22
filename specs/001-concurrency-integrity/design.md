# 001 设计

## 数据库

- 新增迁移 `008_concurrency_integrity.sql`。
- `idempotency_keys` 增加 `request_hash`，占位写入与冲突判断包含该字段。
- 用 D1 trigger 阻止同任务第二条 `open` / `reviewing` 争议，避免 API 先查后写竞争。
- 用 D1 trigger 阻止在非 `held` 托管或非运行/验收任务上插入争议，关闭验收与冻结竞争窗口。

## 存储契约

- 派发阶段占用同时检查任务 `running` 和托管 `held`。
- 新增回调原子应用方法，把 callback claim、任务/托管/阶段 CAS、事件、进度和派发终止放入同一 D1 batch；通用平台故障处理仍可使用独立 running CAS。
- 验收和裁决返回 `applied` 标记，调用方据此区分首次转换与并发重放/冲突。
- 任务启动同样返回 `applied` 标记，只有首次转换写启动事件。
- D1 的结算和裁决批次让所有副作用受首次状态转换条件保护。
- 事件更新任务进度时使用单调最大值；Agent 事件附带阶段状态守卫，避免乱序回调覆盖规范显示状态。

## API

- 对已解析 JSON 做稳定键排序并计算 SHA-256，传给幂等存储。
- Agent 回调 CAS 失败返回 `INVALID_STAGE_TRANSITION`。
- 派单故障使用相同的 running CAS；回调终态先到时返回最新阶段而不覆盖。
- 数据库活跃争议约束映射为 `ACTIVE_DISPUTE_EXISTS`。
- 迟到裁决返回 `DISPUTE_ALREADY_RESOLVED`。
- 通用事件 POST 对请求方实施命令白名单，对开发者拒绝，对管理员保留受校验的审计能力。

## 测试

- 幂等键不同请求体冲突。
- 终态 Agent 回调后不能回退，进度单调。
- 两次争议创建和两次裁决只产生一次副作用。
- 两次验收只产生一次分账和事件。
- 开发者事件伪造被拒绝；请求方的人工协助内容由服务端固定。
