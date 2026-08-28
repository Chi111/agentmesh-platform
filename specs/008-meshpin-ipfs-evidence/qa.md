# pinme-mesh / PinMe IPFS Evidence QA

状态：通过
日期：2026-08-27

## 自动验证

- `npm test --workspace backend`：11 个测试文件、159 条测试全部通过。
- `npx tsc -p frontend/tsconfig.json --noEmit`：通过。
- `npm run build:frontend`：通过。
- `WRANGLER_LOG_PATH=/tmp/agentmesh-wrangler.log npm run build:worker`：通过；Wrangler `--dry-run`，没有部署。
- `npm run build:contracts`：通过；仅有 OpenZeppelin 未来关键字警告，没有部署。
- `npx playwright test --workers=1`：Chromium 29 条全部通过；新增的 PinMe v1/v2 父版本 diff、CAR 命令、当前 attempt 隔离和纠纷档案登记用例也分别定向复跑通过。一次 5-worker 运行曾在既有 React Flow 边点击用例并行超时，单测复跑及完整单-worker 套件均通过。
- 全量迁移后重复执行 `026_meshpin_ipfs_evidence.sql`：`PRAGMA integrity_check = ok`。
- `git diff --check`：通过；前端构建产物已恢复/清理，没有混入需求差异。

## 覆盖重点

- 真实 CID/伪造 CID、canonical hash、过深 JSON、危险路径、过期验收标准。
- 三版本 append-only 链、跳号/并发冲突、父 deliverable/CID 约束和 D1/MemoryStore parity。
- Gateway 未配置、超大响应、有效 Manifest、禁止重定向和已验证历史不因暂时不可用而撤销。
- 手工交付、Agent callback、legacy URI、当前 attempt、验收快照、纠纷快照和 Agent CID 履历。
- 仲裁委员冻结档案权限、确定性审核档案、subject 绑定和档案 CID 登记冲突。
- pinme-mesh/PM 用户文案、移动端无横向溢出、既有工作流、Escrow、仲裁和奖励治理回归。

## 浏览器工作流证据

- `/#/missions/MISSION-DAG-E2E/acceptance`，任务方角色，显式 API mock contract：从 legacy 最终交付切换到当前 attempt 的 PinMe v2，断言父版本、文件新增/删除 diff、固定 CID 与 `pinme export` 命令；旧 attempt 只出现在历史证据，不出现在当前交付选择器。
- `/#/arbitration`，管理员/仲裁委员角色，显式 API mock contract：读取纠纷冻结快照，断言 CAR 导出命令，下载确定性审核档案，登记用户上传后的档案 CID，并在重新读取后显示登记结果。
- `/#/yd-finance`，已登录用户角色，显式 API mock contract：断言 pinme-mesh Contribution / PM 公共名称、贡献治理定位、测试网配置状态和 390px 移动端无横向溢出。
- 成功状态由 Playwright DOM/role 断言验证；下载使用浏览器 Blob 路径，未向真实 PinMe、Gateway 或线上 Worker 发请求。

## 未执行

- 2026-08-27 初始本地 QA 未运行 `pinme save`、未应用远程 D1、未配置外部 Gateway、未上传真实业务文件，也尚未部署 PM 测试合约或主网合约。

## 2026-08-28 部署后补充验收

- 已按独立授权完成远程 D1、Worker 和 `mesh-pinme` Web 拆分发布；始终未运行 `pinme save`，也没有配置外部 Gateway 或上传真实业务文件。
- PM Sepolia 可回收冒烟通过：奖励批次 `1787896008` 完成注资、发布、领取、回收、暂停/恢复；完成账户认证、批准、30 天锁仓、Power 自委托、暂停、紧急退出和恢复。
- 独立公共 RPC 只读验收返回 `ok: true`：Treasury 持有完整 `100,000,000 PM`，Distributor/Staking 余额、承诺、锁仓及 Power 均为零，两个合约均未暂停。
- 最终回归：Backend `160/160`、Frontend TypeScript、Frontend production build、Worker dry-run、PM 页面 Chromium `2/2`、两个 PM 脚本语法与 `git diff --check` 全部通过。
- 线上已登录页面只读验收通过：品牌、三个合约地址、奖励、锁仓、Power、治理及 Admin 工具正常加载；没有写入伪造的生产 D1 奖励活动或治理提案。
