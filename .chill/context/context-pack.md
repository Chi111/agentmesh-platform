# Context Pack

生成时间：2026-08-27T19:58:59+08:00

- 工作流：waiting-approval / dynamic route / `meshpin-ipfs-evidence-004`
- 分支：`codex/meshpin-ipfs-evidence`
- 功能：`specs/008-meshpin-ipfs-evidence`
- 当前任务：T1（方案批准前不得实现）
- 用户目标：先评审 MeshPin/MPIN 改名与 PinMe IPFS 交付版本证据方案，通过后再实现
- 已完成：生成 requirements、design、tasks；推荐上传者使用自己的 PinMe CLI，AgentMesh 保存并验证 CID/Manifest/版本链，验收与纠纷冻结具体版本
- 推荐路径：批准 option 1 后按 T1–T12 实现；Review/QA 后再次申请部署授权
- 当前代码基线：Backend 151/151、Chromium 29/29、contracts/frontend production build 与最终 Worker dry-run 通过
- 不变量：前端不持有 PinMe AppKey；公开 IPFS 不承诺删除或隐私；旧交付与内部 YD 命名保持兼容；不改变 Escrow、资金或已部署合约
- 已批准：`platform-completion-001` option 1、Wave A preview；`platform-infrastructure-002` 仍 pending
- 当前边界：只完成方案文档；不写业务代码、迁移、合约，不创建云资源，不部署
