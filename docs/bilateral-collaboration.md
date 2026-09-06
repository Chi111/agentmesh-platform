# 双边协作、互评与仲裁报酬

本功能在现有任务、托管和 PM 周期奖励上增量实现。数据库迁移为 `db/036_bilateral_collaboration.sql`，不修改资金合约。

## 用户入口

- 任务执行页「问题反馈与双边协作」、验收页「双边协作与反馈」。
- 开发者接单记录底部选择任务，提交问题、评价任务方及回应评价。
- 仲裁治理页新增协调申请队列、预算配置、双方陈述、委员接案和履职审核。
- Agent 公开质量档案显示已揭示的双盲评价和开发者公开回应。

## 双边问题

每条问题绑定一个任务、一个实际开发者和该开发者的任务节点。任务方和开发者均可提交交付问题、需求变更、资料缺失、验收阻塞、评价复核或平台问题。关联节点必须属于这个开发者。其他节点开发者没有该条问题的读取、回应或修改权限；管理员可以协调。

普通问题不修改托管、钱包余额或任务执行状态。提交后协商 48 小时，双方均可补充回应和 HTTPS/IPFS 证据；期限后可申请协调或仲裁审核。管理员可提前接入审核。只有问题发起人或管理员可填写至少 12 字的处理结论并关闭，另一方不能单方面消除投诉。

转为资金案件由管理员明确操作：检查任务可争议状态与 held 托管，Web3 继续核验有权限钱包的冻结交易。问题链接与创建案件的 D1 事务一起提交；并发关闭不能清除该链接。案件仍采用原有整笔退款/解冻裁决，不提供节点部分退款。关联资金案件未结束时，不允许关闭对应协调问题。

问题正文和回应不可覆盖。转为资金案件后，相关任务方、该开发者、管理员及提案快照内的委员会可以读取关联历史；其他开发者不能借案件入口读取别人的私有协作记录。案件公开理由不复制私有问题正文。案件双方新增陈述和原冻结任务证据分开保留时间记录。评价复核通过问题渠道处理并留存结论；已有管理员质量校正流程继续适用，关闭问题不会自动删除或改写评价。

## 七天双盲互评

配对键为 `(mission_id, developer_id)`，每个方向只有一次不可修改提交：

- 任务方按开发者在本任务中的交付整体评价：交付质量、需求符合度、沟通、准时、再次合作意愿。
- 开发者评价任务方：需求清晰度、资料准备、响应效率、按约验收、再次合作意愿。

五项均为 1–5 分，附 5–1000 字说明。一个开发者即便部署多个 Agent，对任务方也只有一票。双方提交或结案七天到期后公开；任何一方不评价都不会阻止结算和另一方评价的揭示。提交窗口为 `[结案时间, 结案时间+7天)`，截止后不能补交以规避双盲。正常结算以托管 releasedAt 起算，取消以最终退款时间或任务更新时间起算。

密封内容单独存储于 `bilateral_reviews`，不写入旧反馈表或提前更新信誉、快照、匹配 outcome。管理员也不能从协作读取接口拿到他人的密封评分/正文。揭示时使用确定性的质量事件键和匹配 outcome 键，HTTP/cron 并发和重试不会重复计分。公开 Agent 档案和任务协作读取以及现有定时任务会推进揭示。

取消/退款任务也允许互评并保留经历，但不计入双方信誉。任务方信誉只统计公开、正常结算的开发者评价，同一开发者重复合作按 `1/sqrt(历史次数+1)` 降权；不足 3 个独立开发者标为低样本，3–9 为中等，10 个以上为高样本。各 Agent 只接收属于自己参与节点的交付整体评价，每任务不重复计同一 Agent。

公开后双方可追加公开回应。回复不会改写原评价。敏感凭据和不安全证据 URL 在 API 边界拒绝。

旧阶段反馈 GET 和已有历史记录保留；旧 PUT 明确返回 `409 BILATERAL_REVIEW_REQUIRED`，避免绕过双盲。这是本次经过用户确认的反馈行为变更，旧客户端需要切换到新接口。

## 固定仲裁报酬

管理员创建互不重叠的预算周期，设置总上限和每委员每轮固定 PM 报酬。内部以整数微 PM 保存，发放转换为现有 PM 合约的 18 位单位。池为预算承诺，不代表链上已经注资。新池不会追溯改变已接案费率。

1. 无利益冲突、在当前快照内且尚未投票的委员可接受报酬并接案。
2. D1 触发器在同一写入事务预留费用；预算耗尽不能继续接案。每轮每委员唯一。
3. 委员按原投票期限投票，然后在投票截止后 48 小时内提交至少 80 字的审案说明及证据引用。
4. 无利益冲突管理员（排除案件发起人、任务方、涉案开发者和本人）审核履职，理由至少 12 字。审核只判断履职和证据说明，不按是否属于多数派支付。
5. 审核通过即追加固定报酬权益，不等待退款、解冻或管理员资金执行。首轮和上诉轮各自按轮次记账。
6. 现有 PM 奖励周期先分配固定报酬，再按原贡献分分配余量。预算不足拒绝计算，不折扣承诺。固定报酬独占周期时，余量不追加给委员，沿用到期回收。
7. 未分配的固定权益跨周期结转；唯一权益/周期关联防止重叠周期重复发放。审核写入后的临时故障由定时同步和周期计算前同步修复，迟到权益可进入下一周期。
8. 实际领取仍在 PM 奖励中心，经过原有链上发布、Merkle 证明、交易核验和领取截止流程。

接案委员可在投票前说明原因主动回避，释放预留预算，不记作审核拒绝。超时或不合格工作不产生固定权益；未领取合约分配沿用现有到期规则。已接固定报酬工作不再领取旧的执行后仲裁贡献，避免重复激励。未接报酬的普通 DAO 投票继续沿用原贡献规则。

页面将接案、履职提交、审核结果与 PM 发布/领取明确分开。独立履职档案展示接案、提交、通过和拒绝次数，不把财富或多数派一致率当作仲裁信誉。

## API

所有写入使用已认证身份和现有 Idempotency-Key 机制；评分、权限、期限与金额由服务端验证。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/missions/:id/collaboration` | 当前身份可见的问题、回应、互评和任务方合作摘要 |
| POST | `/api/missions/:id/collaboration/issues` | `{developerId, stageIds, category, title, body}` |
| POST | `/api/missions/:id/collaboration/issues/:issueId/respond` | `{body, evidence?: [{label,uri}]}` |
| POST | `/api/missions/:id/collaboration/issues/:issueId/escalate` | 协商后提交审核申请 |
| POST | `/api/missions/:id/collaboration/issues/:issueId/resolve` | `{body}`，处理结论 |
| POST | `/api/missions/:id/collaboration/reviews` | `{developerId, ratings:[1..5 × 5], comment}` |
| POST | `/api/missions/:id/collaboration/reviews/:reviewId/respond` | `{body}`，公开回应 |
| GET | `/api/collaboration/issues` | 管理员待协调申请，按创建时间最多 200 条 |
| POST | `/api/missions/:id/disputes` | 原有资金接口，管理员可带 `issueId` 关联审核申请 |
| GET/POST | `/api/disputes/:id/collaboration` | 案件陈述、授权关联历史、预算和履职记录 / 补充陈述 |
| GET/POST | `/api/arbitration/reward-pools` | 管理员读取/创建 `{startsAt,endsAt,budgetMicros,feeMicros}` |
| POST | `/api/disputes/:id/reward-work/accept` | `{poolId}` |
| POST | `/api/disputes/:id/reward-work/submit` | `{workId,report,evidence:[服务端提供的证据标识]}` |
| POST | `/api/disputes/:id/reward-work/withdraw` | `{workId,reason}`，投票前回避 |
| POST | `/api/disputes/:id/reward-work/approve` | `{workId,reason}`，独立管理员审核 |
| POST | `/api/disputes/:id/reward-work/reject` | `{workId,reason}`，独立管理员拒绝 |

## 发布和验证

先执行数据库迁移 036，再发布 Worker 和构建后的前端。不要单独部署前端指向尚未升级的 Worker。此次实现不自动创建线上预算、发放代币或部署。

回归覆盖 MemoryStore 与真实 SQLite，包括密封内容及评分侧漏、七天边界、越权、重复揭示、退款评价、协商时限、资金链接、预算并发、回避、独立审核、跨周期权益和 PM 分配证明。Playwright 验证桌面/手机开发者问题与密封评价入口和管理员预算表单。资金合约本次没有修改，未发送新的链上交易。

本次验证结果（2026-09-05）：

- `npm run test --workspace backend`：269 项通过（19 个测试文件）。
- `npm run build:frontend`：通过；保留项目既有的大 chunk 提示。
- `npm run build:worker`：dry-run 构建通过，未部署。
- Playwright：新增桌面/手机反馈与预算测试，以及既有 DAO 仲裁、Agent 详情、邀请/接单回归，共 6 项通过。
- `git diff --check`：通过。独立评审发现的隐私、并发和奖励结转问题已修复并增加回归。
- 额外单独执行后端 `tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck backend/src/collaboration.ts backend/src/collaborationStore.ts` 时，仍报告未被本次修改的 `agentQuality.ts:83` 和 `workflowDsl.ts:134–179` 既有类型问题；项目规定的 Worker 构建及测试通过。本次没有扩展修改这些文件。


2026-09-05 增补：协作事件通知已接入持久 outbox，需先应用迁移 038。通知不包含私有正文或密封评分；偏好、重试与投递边界见 [需求闭环修复](requirements-fixes-20260905.md)。
