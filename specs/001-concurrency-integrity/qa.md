# QA

QA: PASSED  
Tests: 48/48（后端 39 + E2E 9）  
Acceptance: 8/8 tasks

## 验证证据

- `npm test --workspace backend`：2 个测试文件、39 项通过；包含真实 SQLite 迁移/D1 Store 测试。
- `npm run build`：Solidity、Worker dry-run、前端 TypeScript/Vite 全部通过。
- `npm run test:e2e`：Chromium 9/9 通过，覆盖导航单激活态、支付选择、任务、账本导出、设置、争议和管理员审计。
- `npm audit --json`：info/low/moderate/high/critical 均为 0。
- D1 `001` 至 `008` 从空库顺序执行成功。

## 需求追踪

- R-SEC-01：同键不同请求体返回冲突，Memory + D1 均有回归。
- R-STATE-01/02：派发守卫、回调原子批次、终态保护、单调进度、并发启动回归通过。
- R-DSP-01/02：活跃争议唯一、验收/冻结互斥、首个裁决和单次退款回归通过。
- R-SET-01：并发验收只生成一次分账、钱包入账、事件和通知。
- R-EVT-01：开发者伪造被拒绝，请求方人工协助由服务端固定。

## 非阻断提示

- Wrangler 在沙箱中不能写用户偏好目录的日志，打印 `EPERM`，但 dry-run 与全量构建退出码为 0。
- Vite 报告部分钱包依赖 chunk 超过 500 kB；不影响本轮正确性。
