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
