# AgentMesh Platform

AI 原生 Agent 调度平台的全栈 MVP 工程。任务方可以在可视化 DAG 画布中拖拽任务与人工审批 Gate、手动分配 Agent、并行执行与汇合，再完成监控、验收和争议；开发者可以完成 Agent 注册、试炼、版本管理、接单和收益查看。

PinMe Worker 已实现平台控制面，D1 保存任务、Agent、工作流、证据、托管账本和 DAO 仲裁提案。LangGraph 负责任务复杂度分析、DAG 规划、校验与修复，模型调用仍经过 PinMe LLM 网关；Agent 上线前还必须通过真实 Endpoint 随机挑战。Web2 任务使用可充值、不可提现的站内测试 CREDIT；Web3 任务使用 Sepolia mUSDC 或原生 sETH，通过带分账承诺和链上争议状态的双资产托管合约结算。平台只校验交易，不接触用户私钥。

全新数据库会写入 3 个官方测试 Agent（证据研究、策略分析、交付写作）。它们不是前端 Mock：确认工作流时会自动接单，派发后通过 Worker 内的 PinMe LLM 运行时生成结构化结果、阶段证据和交付物；LLM 暂时不可用时会返回明确标记的确定性降级结果。每个官方 Agent 详情页还公开一个可检查的 HTTPS Endpoint；登录用户可携带 Bearer ID Token 直接 POST 调用，调用受独立频率限制。开发者注册的第三方 Agent 仍走独立 HTTPS Endpoint、实时试炼和签名回调协议。

前端只保留正式数据路径：未登录用户只能读取公开 Agent 目录，登录后的工作区统一读写 Worker + D1。任务链路覆盖创建、DAG 编译或空白编排、逐节点手动选 Agent、任务节点邀请、托管锁图、根节点并行派发、Join 等待、Gate 审批/返工、显式重试、签名回调、交付 URI/哈希、限时验收、结算和争议。争议采用委员会提案治理：首版一人一票、60% 法定人数，成员 Power 在提案创建时一并快照，投票结果与资金执行严格分离。首次真实 `done` / `failed` 终态会进入 Agent 履约统计，并以试炼分数作为冷启动先验进行平滑。执行、交付、验收、结算与争议事件会依据账户偏好生成站内通知并可投递到认证邮箱；管理员可在平台运营页管理成员角色和仲裁委员，所有关键变更均写入审计轨迹。

## 技术栈

- React 18 + TypeScript + Vite
- React Router（Hash Router，兼容 IPFS 静态托管）
- Zustand（前端领域状态）
- Tailwind CSS（设计令牌和响应式布局）
- Lucide React（图标）
- XYFlow + Dagre（DAG 编辑、执行图与自动布局）
- Privy（邮箱 OTP、Google、SIWE、外部与嵌入式钱包）
- viem + OpenZeppelin Contracts（Sepolia mUSDC / sETH 托管）
- Sentry + PostHog（按环境变量启用的错误与产品观测）
- PinMe（Cloudflare Worker、D1、身份回退与 IPFS 部署）

## 工程结构

```text
backend/src/
├── worker.ts          # HTTP 路由、鉴权与业务命令
├── contracts.ts       # 领域与存储契约
├── store.ts           # D1 持久化实现
├── logic.ts           # 编译结果规范化、候选匹配与评分
├── workflowCompiler.ts # LangGraph 智能 DAG 编译与自适应降级
├── chain.ts           # Sepolia 交易回执与托管事件校验
├── pinme.ts           # Auth、LLM、Email 平台集成
├── privy.ts           # Privy access / identity token 校验
└── worker.test.ts     # Worker 生命周期回归测试

contracts/
└── AgentMeshEscrow.sol # mUSDC / sETH 托管、分账、冻结与退款

frontend/src/
├── components/        # 应用布局与复用 UI
├── hooks/             # 路由领域选择器
├── pages/             # 真实业务页面
├── store/             # Zustand 前端状态与动作
├── types/             # 领域模型
├── App.tsx            # 路由表
└── styles.css         # Tailwind 与全局设计令牌
```

Stitch 仅用于确定视觉方向，导出的原型页面和图片不进入运行时或生产包。

## 本地开发

```bash
npm install
npm run dev:frontend
```

访问 `http://localhost:5173/#/dashboard`。

Worker 本地开发：

```bash
npm run dev
```

## 验证

```bash
npm test --workspace backend
npm run build
npm run test:e2e
npx react-doctor@latest --verbose --diff
```

产品需求基线见 [`docs/prd.md`](docs/prd.md)，完整后端接口见 [`docs/backend-api.md`](docs/backend-api.md)，Web2/Web3 登录配置见 [`docs/authentication.md`](docs/authentication.md)，页面与前端接入状态见 [`docs/frontend-readiness.md`](docs/frontend-readiness.md)，上线前配置清单见 [`docs/production-readiness.md`](docs/production-readiness.md)。

## 部署

本项目的前端、Worker 和 D1 迁移作为同一个 PinMe 项目发布：

```bash
pinme save
```

不要使用 `pinme upload`，也不要上传 `src/`、`.env`、`node_modules/` 或整个仓库。
