# 007 平台剩余能力完善设计

状态：`platform-completion-001` option 1 已批准；Wave A 执行中

## 分层架构

```text
React UI
  -> Worker command/query API
    -> D1 control plane + outbox + checkpoints
    -> private export/object service (approval required)
    -> semantic index (approval required)
    -> isolated container runtime (approval required)
  -> Sepolia/Mainnet contracts
    -> AgentMeshEscrowV2
    -> Arbitration Governor + Timelock
    -> YD Earn Vault + allowlisted adapters
    -> canonical bridge adapter
```

控制面继续以 Worker + D1 为事实来源；合约只处理必须在链上强制的不变量；任意代码执行和大文件生成从 Worker 隔离出去。

## 推荐实施波次

### Wave A：无真实资金扩张

- 任务暂停/恢复、版本化返工请求和调度检查点。
- 受限条件边、字段映射、子工作流与有界循环。
- Power 加权仲裁与一轮上诉，但资金执行仍保持现有人工签名边界。
- 大规模导出作业的领域模型和接口；存储后端在基础设施门批准前保持关闭。
- 更新 PRD、API、前端状态、迁移和全量回归。

### Wave B：外部基础设施

- 私有导出对象存储与短期下载令牌。
- Vectorize/Embedding 召回、离线重排评估和可解释推广标识。
- 独立容器 Runtime、镜像策略、网络出口和短期凭据。
- 该波次需要确认 PinMe 可配置的绑定/服务，禁止手工破坏生成配置。

### Wave C：资金协议 v2

- `AgentMeshEscrowV2`：链上 deadline、permissionless timeout release、冻结互斥和版本化存入。
- Agent 保证金、罚没、补偿和退款状态机。
- Governor/Timelock 允许列表执行。
- Foundry/Hardhat 属性测试、Sepolia 演练、迁移和独立审计；旧合约保持可读和可结算。

### Wave D：真实收益、跨链与主网

- 独立 ERC-4626 Vault、策略适配器、限额、暂停和损失控制。
- canonical YD + bridge adapter 的供应不变量和灾难恢复。
- 逐级资金上限、主网审计与生产发布。

## 关键状态边界

### 暂停

推荐引入 `missions.status = paused` 与 `pause_mode = requester | emergency`。暂停只阻断新派发和后继推进；已派发节点的合法回调仍可封存。恢复从 D1 checkpoint 重新计算可运行节点，避免重复派发。

### 请求修改

返工请求是只追加版本：`mission_change_requests` 保存目标、原因和验收变化；被返工节点产生新 attempt/run，而历史阶段结果、制品和反馈不可覆盖。任何改变 payout commitment 的请求必须转为退款和新任务。

### 高级图

条件使用受限 JSON 表达式；映射使用 JSON Pointer；循环编译为带 iteration 的有界运行实例；子工作流在确认前解析为版本化模板引用并接受全局节点/边限制。检查点包含工作流版本、运行版本、节点 attempt、条件结果和出站 outbox 序号。

### 自动换 Agent

替换是显式状态机，不是静默选择：失败节点进入 `replacement_pending`，候选继续走统一质量准入和所有者邀请。若替换会改变链上收款承诺，则原任务不能继续，必须退款/新建。

## 数据与 API 草案

预计新增独立迁移，包含：

- `mission_pauses`, `mission_change_requests`, `workflow_checkpoints`
- `workflow_templates`, `workflow_conditions`, `workflow_mappings`
- `arbitration_appeals`, versioned vote mode/snapshot fields
- `export_jobs`, `export_artifacts`
- semantic index references and runtime execution attestations
- contract deployment/version registry and migration evidence

所有写 API 使用现有鉴权、长度限制、幂等键绑定和审计事件。具体字段在每个波次的子规格中冻结，避免一个超大迁移同时承担所有模块。

## 安全与回滚

- Wave A 通过 feature flags 和新增状态迁移回滚，不删除历史数据。
- Wave B 的外部服务 fail closed 于写入，核心任务执行不依赖语义索引或导出服务可用。
- Wave C/D 合约不可原地伪升级；新存入切版本，旧任务由旧合约完成，迁移需用户签名或明确协议路径。
- 任何资金、云资源、测试网或生产 mutation 都在独立 approval gate 后执行。
