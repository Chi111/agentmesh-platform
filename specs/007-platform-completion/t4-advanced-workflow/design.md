# T4 高级工作流设计

## 数据模型

- `workflow_edge_rules.condition_json` / `mappings_json`：使用独立 replay-safe metadata 表，在草稿时持久化已规范化的 DSL 与字段映射。
- `workflow_transition_checkpoints`：按 `mission + edge + source_attempt` 唯一，保存 matched、映射摘要、工作流版本和求值错误；只追加不覆盖。
- `workflow_templates`：模板身份、所有者和当前版本。
- `workflow_template_versions`：append-only 节点/边快照、入口/出口、创建时间和内容哈希。

## 条件 DSL

叶子表达式为 `{ op, path, value? }`；组合表达式只允许 `and`、`or`、`not`。叶子 op 限于 `exists`、`eq`、`neq`、`gt`、`gte`、`lt`、`lte`、`in`，path 必须是输出根下的 RFC 6901 pointer。AST 深度不超过 6，节点数不超过 40，数组值不超过 20 项。

条件只读取源 stage 的当前 attempt 输出。求值异常、非法类型或超过大小上限都记录 error checkpoint 并 fail closed；不会退化为 truthy JavaScript 求值。

## 映射

映射定义为 `{ from, to, required }`。`from` 读取源 stage 结构化结果，`to` 写入独立 `mappedInput`；多条入边按稳定 edge id 顺序合并，重复目标指针在保存时拒绝。写入器创建普通无原型对象并拒绝危险 key。

派发协议增加：

```json
{
  "task": {
    "mappedInput": {},
    "transitionCheckpoints": []
  }
}
```

## 条件 Gate 调度

当条件边源节点完成时，调度器先用 Store CAS 创建 transition checkpoint。matched=true 时终端 Gate 进入 running；matched=false 时 Gate 以 `done + { skipped: true }` 封存，并写 execution event。条件 Gate 必须是终端零预算 approval，因此不会改变 payout、派发 Agent 或解锁另一条付费路径。

## 模板和循环展开

模板保存的是未分配、未运行的相对图。展开时使用 `templateId/version/instanceId/iteration` 生成稳定命名空间 ID，并重新布局。固定循环等同于连续展开同一版本 1–5 次；每轮出口连接下一轮入口。展开全部发生在 `draft|matching + escrow pending` 状态，随后仍走现有 optimistic workflow save 和确认邀请路径。

替换模式把任务总预算分配给展开节点；插入模式把调用方明确给出的模板预算分配给展开节点，并按原预算权重把剩余任务总预算重新分配给既有任务节点。两者都按支付方式精度使用整数最小单位分配，保存前必须精确回到 mission 总预算。

模板版本哈希覆盖规范化节点、边、入口和出口。任务只保存展开结果及 provenance，不依赖模板当前版本。

## 安全与恢复

- DSL 与 JSON Pointer 逻辑为纯函数并有输入大小上限。
- transition checkpoint 的唯一键提供重放稳定性；暂停门禁仍由 T3 Store CAS 负责。
- 模板查询按 owner 过滤，管理员不获得静默读取他人私有模板的能力。
- 旧 workflow edge 行迁移为 `condition = null, mappings = []`，行为完全兼容。
