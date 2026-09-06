# 需求闭环修复（2026-09-05）

本轮落实需求复盘的三个 P1：新任务完整成果包门禁、未托管改期、协作通知。保留既有工作区改动，不涉及链上合约或资金分配规则变更。

## 1. 版本化成果包门禁

迁移 `037_mission_delivery_policy.sql` 增加 companion table。API 新建任务固定 `outcome_v1`；数据库原有任务无记录时使用 `legacy`，客户端不能自行降级。编排与改期不修改交付策略。

新任务必须同时满足：全部节点完成、有效结构化结果、当前 attempt 的 Implement 制品、已验证的完整成果包。成果包 Manifest 增加可选 `outcomePackage`：

```json
{
  "schema": "agentmesh.mission-outcome.v1",
  "workflowVersion": 3,
  "stages": [{ "stageId": "node-1", "attemptNo": 1 }]
}
```

必须覆盖当前全部节点（包括人工 Gate），节点 ID 唯一且 attempt 完全匹配。必需文件为 `deliverable.md`、`index.html`、`acceptance-report.md`、`artifact-index.md`，每份文件非空。`GET /api/missions/:id/evidence/context` 提供 `outcomePackageTemplate` 和 `requiredOutcomeFiles`；提交完整成果包时将模板放入 Manifest 后重新计算 canonical SHA-256。

第三方仍通过签名回调或原交付接口提交 CID/Manifest，不能自报 `verified`。`POST /api/missions/:id/deliverables/:deliverableId/verify` 在固定 Gateway 核验 Manifest，并对四个必需文件逐项核对实际字节长度与 SHA-256；每文件最多 1 MiB，禁止重定向，单请求 5 秒超时。加密内容按已上传密文字节核验，验证不表示平台已解密或认可正文质量。未验证、文件缺失/篡改、旧工作流或旧 attempt 均不能完成新任务验收。

官方 Agent 使用平台已生成、哈希并成功发布的字节。除节点终点输出外，全官方工作流在全部节点完成后可确定性汇总各节点实际成果，支持并行终点和审批终点；不声称额外做过研究或运行。混合/第三方工作流仍由实际发布者负责最终成果包。官方汇总需要任务方 PinMe 配置或已有平台回退配置。

派发批次后重新检查汇总。cron 每轮最多扫描 80 个持久化的「全官方、running、全部节点 done」任务，因此上传失败后即使没有 pending/dirty 记录也可重试。汇总 ID 绑定任务、工作流版本和节点 attempts；重复入库受唯一约束保护，成功进入 review 后不再扫描。该扫描沿用有限批量处理，超大积压的分页和退避运营仍可后续完善。

进入 review 的手工、回调、cron 和 Gate 路径，以及最终 accept 均使用统一门禁。验收页优先展示当前完整成果包，缺失时解释不能验收的原因。文件校验是证据完整性校验，最终业务质量仍由任务方验收。

## 2. 未托管改期

新增 `PATCH /api/missions/:id/deadline`，请求 `{deadline, workflowVersion}`，沿用 Idempotency-Key。仅真实任务方可操作，要求明确时区及未来时间。

D1 在同一批事务中比较版本并校验 `draft/matching + pending escrow`，更新截止时间、递增工作流版本、归档旧接单报价、清除邀请和团队确认、重置待托管报价并写审计事件。节点保留；旧推荐计划的版本/快照立即失效。并发改期只能一个成功，已托管任务拒绝。

编排页增加改期表单，说明设备时区和失效影响。保存后重新读取任务、邀请和候选；画布清除旧方案展示。用户应先保存尚未提交的画布修改。已托管任务的协商改期/追加费用不在该接口范围。

## 3. 协作通知

迁移 `038_collaboration_notifications.sql` 通过数据库触发器与协作写入一起产生 outbox：新问题、回应、问题状态变化、48 小时可升级、密封提交、评价揭示、仲裁履职审核结果。MemoryStore 提供同等事件行为供测试使用。

通知只包含通用事件名与任务 ID，不复制问题正文、陈述、评分、密封评价或证据 URL；只发送给该条记录的合作双方/对应委员，不广播其他开发者。已解决或已升级问题不再发送过期协商提醒。

API 协作请求后及 cron 推进投递。站内通知使用确定性 ID 去重；队列通过 5 分钟租约防止并发重复处理，服从 `taskUpdates` 和 `emailChannel` 偏好。邮件网络异常、HTTP 失败和 `{ok:false}` 均保留队列重试。邮件提供方不支持事务式确认：若发送成功但响应丢失，重试可能产生重复邮件；站内记录仍唯一。不承诺外部邮件恰好一次送达。

## 发布顺序与验证

先应用迁移 037、038，再更新 Worker，最后发布前端构建产物；旧 Worker/新前端混用不能提供本轮能力。本轮已于 2026-09-05 完成线上迁移、Worker 与前端部署，未执行资金交易。详见 [发布记录](../.chill/state/deploy/deploy-20260905-requirements-fixes.md)。

验证结果在本任务交付时更新。数据库测试从空库执行全部迁移；包括真实 SQLite 的改期事务、通知触发器、去重/隐私及失败重试。浏览器使用 fixture 验证页面交互，不代表真实线上发布。


本轮本地验证：

- `npm test --workspace backend`：21 个测试文件、301 项通过（含 SQLite 迁移回放、改期版本竞争、严格成果包/文件篡改、cron 发布失败恢复、通知去重/重试与隐私）。
- `npm run build:frontend`：通过，保留既有大 chunk 提示。
- `npm run build:worker`：dry-run 通过。
- 独立后端 `tsc --noEmit` 仍受已有 agentQuality、chain、workflowDsl、ydChain 等类型问题阻塞，未宣称独立后端类型检查通过。
- 独立评审发现的并行/审批汇总路径和邮件失败确认问题已修复并复核，无剩余阻断项。
- 最终 Playwright：`mission-reschedule`、`mission-planning`、`candidate-eligibility`、`bilateral-collaboration` 与 `critical-flows` 共 29 项通过。
- `git diff --check`：通过。构建产物已更新并发布，线上资源指纹核验通过。
