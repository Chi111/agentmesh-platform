# Decision Log

- 日期：2026-08-18
  决策：新增 `docs/prd.md` 作为需求基线，并在任何业务代码修改前写入六项并发与状态完整性验收标准。
  来源：用户要求“有漏洞先修改 PRD 再改代码”；代码审计；`docs/prd.md` v1.1。
  适用：`specs/001-concurrency-integrity`、Worker、D1、回归测试。
  复核条件：支付模式、链、智能账户或生产部署范围变化。

- 日期：2026-08-20
  决策：先实现不改资金权限的 Agent Market 基础闭环；接单邀请是托管启动前置，试炼只作信誉冷启动先验，验收期限只形成 SLA。
  来源：同类 Agent Market 对比、用户要求完善本项目、现有合约仅允许 requester 释放资金。
  适用：`specs/002-market-foundation`、Worker、D1、前端。
  复核条件：需要 6% 质押、无人验收自动放款或合约 v2 时。

- 日期：2026-08-26
  决策：`platform-completion-001` 选择 option 1，按安全分阶段完成全部剩余路线图。先实施不扩张真实资金权限的 Wave A；外部基础设施、Escrow v2、Earn/跨链、测试网部署和生产发布在各自边界单独批准。
  来源：用户回复“1”；`specs/007-platform-completion`。
  适用：T3–T14 的依赖顺序和所有资金/云资源操作。
  复核条件：用户明确调整优先级或批准后续 gate。

- 日期：2026-08-27
  决策：T4 高级工作流仅支持非可执行、静态有界的安全子集。条件 Gate 必须是终端零预算审批节点；字段映射只复制当前直接上游结构化输出；模板在出资前展开并冻结为 canonical DAG；失败的映射必须通过上游返工产生新 attempt，不能对不可变 checkpoint 做无效孤立重试。
  来源：`specs/007-platform-completion/t4-advanced-workflow`、多轮 Review Gate。
  适用：工作流 DSL、调度、模板、循环、返工和交付证据。
  复核条件：Escrow v2 明确支持条件性付款，或引入新的运行时隔离/验证模型。

- 日期：2026-08-27
  决策：T5 任务仲裁使用显式版本化的一人一票或委员 Power 快照，首轮终态均开放 72 小时单次上诉；上诉与首轮执行队列必须原子互斥，最终资金动作只能由不可变最终结果推导并继续由管理员钱包签名。
  来源：`specs/007-platform-completion/t5-power-arbitration`、三轮 Review Gate。
  适用：任务争议轮次、委员快照、上诉、执行队列和托管结算边界。
  复核条件：T10 引入 Governor/Timelock，或 Escrow v2 改变可执行动作和托管状态机。

- 日期：2026-08-27
  决策：开发者账本最多 5,000 行继续浏览器直出，超过阈值必须进入所有者隔离的异步作业；作业使用 attempt fencing、5 分钟租约、创建后固定 7 天截止，私有制品保留 24 小时且只能由最长 5 分钟的 HTTPS 签名 URL 下载。Wave A 只交付 fail-closed 控制面，不创建对象存储或外部 worker。
  来源：`specs/007-platform-completion/t6-async-export`、多轮 Review Gate。
  适用：开发者收益账本、导出作业、内部服务回调、私有制品和审计事件。
  复核条件：批准 `platform-infrastructure-002` 并接入真实私有存储、向量索引或隔离 Runtime。

- 日期：2026-08-27
  决策：`meshpin-ipfs-evidence-004` 选择 option 1。最终公开品牌统一为 `pinme-mesh Contribution / PM`，但不宣称 PinMe 官方代币；上传继续由 Agent/开发者自己的 PinMe CLI 登录态完成，AgentMesh 只保存、验证和冻结 CID/Manifest 证据。首版同时生成不可变审核档案、展示 Agent CID 履历，并把验收标准 SHA-256 固化到 Manifest、验收和纠纷快照。所有实现只在需求分支进行，部署、远程 D1、云资源或合约操作需另行授权。
  来源：用户回复“OK，可以，先实现一版，还是需求分支，不要影响线上代码”；`specs/008-meshpin-ipfs-evidence`。
  适用：公开品牌、交付版本链、审核档案、Agent 履历、验收与仲裁证据。
  复核条件：需要浏览器直传、服务端代传、PM 主网合约、强制 IPFS 策略或额外线上基础设施时。

- 日期：2026-08-28
  决策：用户批准 MeshPin 拆分发布：先 `pinme update-db`，确认 026 成功后执行 `pinme update-worker`，前端只上传 `frontend/dist` 并绑定 `mesh-pinme`；不使用 `pinme save` 或 `pinme update-web`。
  来源：用户明确回复“可以”并把域名指定为 `mesh-pinme`。
  适用：MeshPin migration 026、Worker 和独立 PinMe Domain 预览。
  复核条件：部署合约、配置 Gateway、创建额外资源或执行资金操作时。

- 日期：2026-08-28
  决策：公开品牌最终统一为 `pinme-mesh Contribution / PM`，运行时代码只从 `shared/brand.ts` 派生；用户批准复用 Sepolia 专用测试账户完成 PM 合约部署和可回收奖励/锁仓冒烟。批次 `1787896008` 结清后，Treasury 恢复完整固定供应，Distributor/Staking/Power 均归零。
  来源：用户明确指定品牌和 PM 首字母缩写，并明确允许执行 Sepolia PM 完整冒烟交易。
  适用：当前 Sepolia PM 测试发布、UI/API 公共文案和部署审计。
  复核条件：变更公开品牌、部署主网、迁移旧资产或引入正式经济价值时。
