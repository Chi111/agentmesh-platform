# LangGraph 智能工作流预编排设计

## 编译状态图

`analyze → plan → validate → (done | repair → validate | fallback)`

- `analyze`：模型输出复杂度、工作流规模、独立工作流、风险和 Gate 建议。
- `plan`：结合分析结果生成节点、边、执行模式与输入输出契约。
- `validate`：复用平台 `parseLlmCompilation` 和 `validateWorkflowGraph`，并补充节点规模与并行度质量检查。
- `repair`：只把候选图和具体校验错误交给模型修复一次。
- `fallback`：模型链路不可用时，基于描述、标签、优先级、专业等级和领域关键词生成 2–12 个节点的自适应 DAG。

图在单次 `/compile` 请求内同步执行，不使用 checkpoint。模型调用继续经过 PinMe Worker 的现有 LLM 网关，LangGraph 只负责编排和条件路由。

## 兼容与安全

- 编译器返回现有 `WorkflowCompilation`，Store 和前端无需新协议。
- 任务节点 `agentId` 始终为 `null`；审批节点预算为零。
- 只记录结构化编译元数据和错误摘要，不持久化模型原始响应。
- AI 结果在保存前必须通过平台本地校验；预算由平台按任务预算精确归一化。
