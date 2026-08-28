# Lessons

## 2026-08-18 AgentMesh 并发完整性

- API 的“先查再写”不能保护支付或争议状态；最终不变量必须下沉到 D1 trigger、条件更新或原子 batch。
- 幂等键必须绑定规范化请求体，而不只是用户、方法和路径，否则会把不同命令错误重放为同一结果。
- Agent 回调的去重、状态、证据事件和进度属于一个业务提交，拆成多个事务会造成不可重试的半成功状态。
- 争议、验收、启动和派发不是独立功能；它们共享托管状态，必须专门测试交叉并发，而不只测试各自的重复请求。
- 测试内存 Store 用于快速领域回归，但涉及 SQL 条件、trigger 和 batch 结果时必须增加真实 SQLite 适配测试。

## 2026-08-20 Agent Market 基础闭环

- 邀请的 24 小时应定义为“响应期限”，不是已接受承诺的失效时间；否则 Agent 已接受后，链上存入确认期间仍可能跨过截止点并把资金留在链上、任务留在链下。
- 工作流重新邀请只应更新阶段分配并替换邀请，不能删除重建阶段；阶段已经被执行事件引用时，重建会破坏审计外键。
- SQLite 外层 `INSERT OR IGNORE` 会把冲突策略传入 trigger，可能连 trigger 内本应执行的余额 UPSERT 一并忽略；应在目标幂等键上使用 `ON CONFLICT ... DO NOTHING`。
- 负数钱包交易不能把负值作为新余额 UPSERT 的初始值，因为 CHECK 约束在冲突更新前验证；余额不足由 BEFORE trigger 拒绝，AFTER trigger 可用零作为负交易的安全初值。
- 任务方与开发者页面代表不同账户视角，接单状态需要显式刷新或轮询，不能假设同一浏览器内的旧详情会自动同步。

## 2026-08-27 PinMe/IPFS 交付证据

- CID 只解决内容寻址，不自动表达 Mission、stage attempt、验收标准或父版本；业务证据必须用 canonical Manifest 和 D1 append-only 账本把这些上下文显式绑定。
- 不能让 Worker 接受用户提供的 Gateway URL，也不能把 PinMe AppKey 放进浏览器；上传身份应留在用户自己的 CLI 登录态，平台只登记 CID、hash 和版本关系。
- “当前交付”与“案件证据”不是同一个查询：验收和纠纷必须在状态转换的原子边界冻结 deliverable ID 集合，否则后续返工会让历史决定指向新的内容。
- 已验证 CID 后续暂时不可达属于可用性观察，不应撤销历史完整性结论；Gateway 超时、重定向、体积限制和验证状态需要分别建模。
- 仲裁委员需要访问冻结纠纷档案，但不应因此获得整项 Mission 的普通编辑/读取权限；案件级 evidence authorization 应与 Mission participant authorization 分开。
- 公共 Agent CID 履历只能由已完成 Mission 的当前 attempt 派生，且 encrypted 证据只公开摘要，不能复用内部 Manifest 读取接口直接暴露文件清单。
