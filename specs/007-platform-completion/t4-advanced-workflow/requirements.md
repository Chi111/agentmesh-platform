# T4 高级工作流需求

## 目标

在不执行任意代码、不改变已出资任务 payout commitment 的前提下，为草稿工作流增加可持久化的受限条件边、JSON Pointer 字段映射、版本化子工作流模板和静态有界循环。

## 必须行为

- 条件使用受限 JSON AST，只能读取直接上游节点的结构化输出；禁止脚本、正则、动态属性执行和外部调用。
- 条件边首版只允许指向终端、零预算、无 Agent 的 approval Gate。条件为假时该 Gate 以可审计的 skipped 结果完成；条件为真时进入人工审批。
- 字段映射使用 RFC 6901 JSON Pointer，从直接上游结构化输出复制到下游派发载荷的独立 `mappedInput` 对象；禁止 `__proto__`、`prototype`、`constructor` 路径。
- 每条边最多 20 个映射，指针深度、字符串长度和生成载荷总大小有硬上限；缺失必填来源时 fail closed，不派发下游节点。
- 条件结果、映射结果摘要、源 attempt、工作流版本和求值时间写入 append-only D1 transition checkpoint；相同源 attempt 重放只能得到同一记录。
- 子工作流模板属于创建者，使用 append-only 版本；模板只保存未分配 Agent 的节点/边和明确的输入输出边界。
- 模板在任务出资前展开为 canonical DAG 节点和边；运行时不再远程引用模板，后续模板版本不能改变既有任务。
- 有界循环使用模板的固定 `iterations` 展开，范围 1–5；每一轮节点 ID、映射和边均独立，前一轮出口连接下一轮入口。
- 展开后继续服从全局 30 节点、80 边、预算合计、弱连通、无环、节点不重叠和任务分配约束。
- 任何会产生条件性付费、运行期新增节点、超过上限或改变已锁定 Agent/预算/收款人的请求必须拒绝。

## 可观察验收

- Mission detail 返回完整 condition/mapping 定义和 transition checkpoints。
- Agent 派发载荷包含经过边界过滤的 `mappedInput`，不暴露完整上游对象之外的任意数据。
- 工作流编辑页可查看和编辑边条件/映射，保存个人模板，并按 1–5 次展开模板。
- 测试覆盖 DSL 类型/深度/大小限制、false/true Gate、映射缺失、原型污染、checkpoint 重放、模板越权、版本冻结、循环上限和展开后图/预算校验。

## 明确排除

- Escrow v1 下的条件性付费分支、运行期 while 循环和运行期模板远程调用。
- 任意 JavaScript、JSONata、JMESPath 插件或用户提供的表达式源码。
- 自动替换 Agent、修改 payout hash 或生产部署。
