# Agent 市场质量体系设计

## 总体边界

```text
business event -> append agent_metric_events -> deterministic calculator
               -> agent_stats + reputation snapshot
               -> eligibility policy -> market / candidate / offer gates
```

核心策略放在 `backend/src/agentQuality.ts`：纯函数负责分项评分、衰减、阈值、生命周期建议和统一准入。Store 负责事件幂等、事务与快照；Worker 只负责鉴权、业务事件映射和 API 展示。

## 数据模型

- `agent_versions`：Agent 版本、Endpoint、schema、能力与创建时间的不可变快照。
- `agent_trials`：一次正式 Trial 的状态、测试套件、分项、总分、摘要、证据与时延。
- `agent_health_checks`：Endpoint 健康样本。
- `agent_metric_events`：只追加质量事件，唯一 idempotency key，保存数值、权重、严重度、来源与公开/受限详情。
- `agent_feedback`：版本化结构反馈，当前版本由 `(mission, stage, agent)` 唯一定位。
- `agent_stats`：当前读模型；包含分项、总分、置信度、市场状态、硬条件、准入理由和最后健康/Trial 时间。
- `agent_reputation_snapshots`：每次有效重算的输入截止时间、公式版本、分项、状态与原因。
- 管理员校正、风险标记和解除风险也写入 `agent_metric_events`，复用同一条不可变审计链，不维护第二套管理日志。

迁移为现有 Agent 建立 `agent_stats` 影子行，但不伪造 Trial 通过。legacy active Agent 在 shadow 模式继续曝光；切 enforce 前必须补跑正式 Trial。

## 确定性评分

- 所有输入先按 `occurredAt <= evaluatedAt` 截断，再按事件 ID 稳定排序。
- 普通事件使用 `0.5 ** (ageDays / 60)` 权重；`severity=severe` 的安全/欺诈/恶意事件保持生命周期硬阻断，直到追加管理员已解决事件。
- Reliability：`(weightedSuccess + 5) / (weightedSuccess + weightedFailure + weightedTimeout + 10)`。
- Quality：自动 Trial 40%、任务验收 25%、制品完整度 20%、结构化反馈 15%；仅对已有证据来源按固定权重归一化，全部缺失时才使用 0.5 中性先验。
- Delivery：已验证交付与缺失/无效交付的带先验比例。
- Response：健康检查与 Trial 延迟映射到 0–1，超时/不可达为 0。
- History：`min(1, log1p(settledJobs) / log1p(20))`；Trial 不计入真实任务历史。
- Risk：退款、争议败诉、无效制品、超时和严重事件按固定上限扣分。

计算结果限制在 0–100，保留一位小数。旧 `trustScore` 继续作为兼容字段，但公共质量展示、V0 匹配和准入使用新读模型。

## 生命周期

正常流转：

```text
registered -> verifying -> trial -> listed
listed <-> degraded
* -> suspended -> degraded/listed (满足恢复条件)
* -> retired (显式管理员动作，首版不做自动退休)
```

硬条件：legacy 执行状态 active、Trial 通过、Endpoint 最近健康、有效结算钱包、无未解决严重风险、当前市场状态不是 suspended/retired。阈值只决定 listed/degraded/suspended 建议，不能绕过硬条件。

`isAgentMarketEligible(agent, stats, mode)` 返回 `{ eligible, wouldBeEligible, reasons }`：

- shadow：`eligible = agent.status === active`，同时完整返回 `wouldBeEligible` 和原因。
- enforce：`eligible = wouldBeEligible`。

## Trial

现有实时挑战升级为 `agentmesh.trial.v3`：

1. Endpoint 安全解析与 allowlist。
2. 结构化执行场景：带凭据的连通性、Agent ID 与 challenge 回显、输出对象。
3. 错误处理场景：必须返回结构化 4xx 拒绝，不能把无效输入伪装为成功。
4. 交付物场景：必须返回带 kind 与 mimeType 的 artifact 契约。
5. 工程类 Agent 增加 analyze/implement/review 与 verification 能力场景。
6. 每个场景使用独立 challenge；任何响应泄露 Worker 凭据或 token 模式都会失败并形成严重风险事件。

Worker 不把 Agent 原始响应或模型原文写入 D1，只保存清洗后的评分、公开摘要和逐场景通过/失败清单。异常也写 Trial/health 失败记录后再向调用方返回错误。

## 业务事件映射

- Trial passed/failed -> `trial_passed | trial_failed`。
- Endpoint 检查 -> `endpoint_healthy | endpoint_unreachable`。
- done callback 且交付策略通过 -> `artifact_verified`；无效制品 -> `artifact_invalid`。
- 任务验收、托管释放成功 -> 每个已完成任务节点 Agent 一个 `mission_settled_success`。
- 退款/争议败诉 -> `mission_refunded | dispute_lost`；驳回争议 -> `dispute_won`。
- 有效反馈 -> `feedback_received`，质量数值为结构化维度均值。
- 同一任务方对同一 Agent 的跨任务反馈权重为 `max(0.25, 1 / sqrt(priorCount + 1))`；同一节点改评只保留最新版本计分。
- 管理员只追加 `admin_adjustment | security_incident | security_resolved`，必须填写原因。

每个来源生成稳定 idempotency key，例如 `settlement:{missionId}:{stageId}:{agentId}`。

## API

- 公共：`GET /api/agents` 与 `GET /api/agents/:id` 嵌入公开 `quality` 读模型。
- 开发者：`GET /api/developer/agents/:id/quality` 返回自己的 Trial、健康与完整准入原因。
- 反馈：`PUT /api/missions/:missionId/stages/:stageId/feedback` 创建新版本；`GET` 返回当前用户可见反馈。
- 管理员：`GET /api/admin/agent-quality`；`POST /api/admin/agents/:id/quality/recompute`；`POST /api/admin/agents/:id/quality/events`。

## UI

- 市场和详情以信誉 0–100 为主，旧 trustScore 仅作为兼容数据不再作为主视觉。
- 开发者 Fleet 增加市场质量状态、Trial、Endpoint、置信度和准入原因。
- 验收页在成功结算后允许按任务节点评价。
- 管理员质量控制台嵌入现有 Admin 页面，保持产品化卡片与筛选，不做密集后台表格。

## 回滚与发布

- `AGENT_QUALITY_GATE_MODE` 缺失或非法时固定为 `shadow`。
- 若评分链路异常，市场不在 shadow 模式中中断；enforce 模式按 fail closed 隐藏新接单，但 Agent 详情和历史任务仍可访问。
- D1 只新增表与索引；关闭质量闸门即可回到 legacy active 行为，不需要删除数据。
- 生产部署需先在 shadow 模式补跑 PinMe/DS 正式 Trial、比较一段时间的影子分，再单独授权切 enforce。
