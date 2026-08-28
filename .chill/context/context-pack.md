# Context Pack

生成时间：2026-08-27T20:44:03+08:00

- 工作流：completed / dynamic route / `meshpin-ipfs-evidence-004`
- 分支：`codex/meshpin-ipfs-evidence`
- 功能：`specs/008-meshpin-ipfs-evidence`
- 当前任务：T12、拆分发布、PM Sepolia 部署与完整冒烟已完成
- 用户目标：将贡献治理品牌统一为 pinme-mesh/PM，并用 PinMe/IPFS 为交付、验收、纠纷和 Agent 履历提供可验证版本证据
- 已完成：公开品牌、Manifest/CID 校验、三版本 append-only 链、Gateway 状态机、手工/Agent callback 原子写入、验收/纠纷快照、确定性审核档案、Agent CID portfolio、Manifest diff、CAR 指引、文档和 migration 026
- 验证：Backend 159/159、Chromium 29/29、前端类型/生产构建、Worker dry-run、contracts build、migration replay/integrity 与 diff hygiene 通过
- Review：外部 `codex review --uncommitted` 因未授权代码外传而失败并停止；本地安全 fallback Review Gate 为 ALLOW，无 P0/P1/P2
- 不变量：前端/Worker 不持有 PinMe AppKey；公开 IPFS 不承诺删除或隐私；encrypted 内容只公开摘要；旧交付和内部 YD 命名兼容；不改变 Escrow 和已部署合约
- 已部署：远程 D1、Worker、`mesh-pinme` 前端 Domain 与 Sepolia PM 测试合约；可回收完整冒烟后 Treasury PM 已恢复，Distributor/Staking/Power 均归零
- 未执行：`pinme save`、真实 Gateway 配置、R2/Vectorize/Containers/服务器、主网或旧资产迁移
- 下一安全动作：保持现有测试网版本观测；任何主网、额外基础设施或正式经济模型仍需独立批准
