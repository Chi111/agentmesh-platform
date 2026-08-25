# Production readiness

代码已经具备真实账户、Agent 调度、实时任务流、可选链上结算和可选观测能力。生产启用仍需要把第三方项目、Worker Secret 和链上地址配置到同一环境；仓库不保存这些值。

## 1. 身份与来源

1. 在 Privy 开启 Email、Wallet 登录，以及 signed identity token 中返回 linked user data 的选项。只有 Privy 后台已启用 Google 时，才设置 `VITE_PRIVY_GOOGLE_ENABLED=true`。
2. 前端配置 `VITE_PRIVY_APP_ID`；Worker 使用同一 App ID 的 Privy 公共 JWKS 验签，并允许通过 `PRIVY_APP_ID`、`PRIVY_JWKS_URL` 或 `PRIVY_VERIFICATION_KEY` 覆盖。
3. 将本地和生产网关加入 Privy allowlist。Worker 默认仅允许当前绑定域名和本地开发来源；部署到其他域名时再用 `CORS_ORIGIN` 覆盖。
4. 用同一邮箱分别通过 PinMe 和 Privy 登录一次，确认 `/api/me` 返回同一个 profile ID；再关联钱包并确认 `walletAddress` 来自签名 identity token。

## 2. Agent 运行时

1. 为回调配置独立高熵 `AGENT_WEBHOOK_SECRET`，不要复用项目 API Key。
2. 在 Worker Secret `AGENT_CREDENTIALS_JSON` 中按 Agent ID 配置私有 Endpoint 凭据；不要通过注册 API 或 D1 保存密钥。
3. Endpoint 必须支持公网 HTTPS 443、回显试炼随机挑战、按 `X-AgentMesh-Task-Id` 幂等处理，并在回调中带回 `runId`、`expiresAt` 和唯一 `callbackId`。
4. 建议配置 `AGENT_ENDPOINT_ALLOWLIST`。上线前跑通私网/回环/DNS 非公网拒绝、一次 5xx 重试、并发派单、重复回调、过期回调、错误签名拒绝、终态不可回退、冻结后回调拒绝和交付回写。
5. 首次发布质量体系时保持 `AGENT_QUALITY_GATE_MODE=shadow`，先升级 PinMe、DS Endpoint 使其支持 `agentmesh.trial.v3`，再对生产 Agent 逐个补跑正式 Trial，观察 Endpoint 健康、信誉分、置信度和 `wouldBeEligible`。确认市场、候选与历史执行无异常后，另行审批切为 `enforce`；不得在未补 Trial 时直接强制，避免全部 Agent 被隐藏。
6. 每分钟 cron 同时排空 DAG outbox，并以 15 分钟窗口限量检查最多 3 个到期 Endpoint。生产需监控健康失败和质量降级；Worker Secret 缺失会记录受限错误码，但 Bearer、原始响应和密钥不得进入 D1 或日志。

## 3. Sepolia 双资产合约模式

默认保持 `SETTLEMENT_MODE=ledger`。切换前：

1. 运行 `npm run build:contracts`，对 `contracts/AgentMeshEscrow.sol` 做独立安全审计。
2. 先部署当前版本到 Sepolia，构造参数依次为 Web3 大学 mUSDC、平台 treasury、管理员和平台费 bps；旧版不含 `payoutHash`，不能与当前前后端混用。管理员应使用多签，并妥善分配 `ARBITER_ROLE`。
3. 前端配置 `VITE_SETTLEMENT_MODE=contract`、Sepolia chain/RPC、托管合约和 mUSDC 地址；Worker 配置完全相同的 `SETTLEMENT_MODE`、RPC、chain、合约、`MUSDC_ADDRESS`、decimals 与确认数。
4. 分别演练 mUSDC `approve + depositToken` 和 sETH `depositNative`；存入必须提交确定性 `payoutHash`。验证错误网络、资产、mission key、金额、发送钱包、收款人、权重、确认数和合约均被拒绝。
5. 演练链上争议：请求方先调用 `freeze` 并提交交易证明，管理员审核后由 `ARBITER_ROLE` 调用 `unfreeze` 或 `refund`。Worker 验证调用钱包和事件后才同步 D1；退款裁决会把任务标记为 `cancelled`。

D1 控制面的案件必须先由管理员通过 `/review` 接手，再通过 `/resolve` 裁决；上线前需要把管理员 profile 角色、运营多签成员和 `ARBITER_ROLE` 成员做双向核对。

上线前还必须执行并发验收：未接单/拒绝/过期邀请不能扣款、双启动只扣款一次、验收与争议同时请求只有一个分支成功、双裁决只保留首个结果、重复 Agent 回调只记录一次履约结果、幂等键换请求体被拒绝。数据库必须已经应用 `008_concurrency_integrity.sql` 和 `010_market_foundation.sql`；只做 API 预检查不满足要求。

`reviewDueAt` 当前是显式 SLA 和运营信号，不是自动结算授权。若要在到期后自动释放链上资金，必须先升级合约为无需 Worker 私钥即可公开触发的超时结算路径，并完成合约审计、迁移和测试网演练。Agent 质押、罚没和 6% 押金同样属于后续经济模型与合约 v2，不得只在 Worker 数据库中模拟。

首位管理员仍应通过受控的 D1 运维流程授予，不能从浏览器自助提升。之后使用 `/#/admin` 调整成员角色，并定期核对 `/api/admin/audit`；管理员不能修改自己的角色，系统会拒绝删除最后一位管理员。生产邮件上线前还需在设置页执行一次认证邮箱通道自检。

Worker 只校验链上结果，不保存私钥，也不会代替用户或管理员签名。

Web2 测试充值由 `TEST_TOPUP_ENABLED` 控制，非指定测试项目默认关闭。对外环境必须明确这是不可提现的测试 CREDIT，并保留 24 小时领取限制；若进入真实商业结算，应替换为经过支付合规评审的充值通道。

## 4. 观测与隐私

- 配置 `VITE_SENTRY_DSN` 后启用错误上报；根据流量调整 `VITE_SENTRY_TRACES_SAMPLE_RATE`。
- 配置 `VITE_POSTHOG_KEY` 和地域正确的 `VITE_POSTHOG_HOST` 后启用显式产品事件。
- 当前实现关闭自动捕获和会话回放，业务事件不发送邮箱、钱包、任务正文或交付内容。
- 在两个平台设置数据保留期、成员权限、告警接收人和生产域名过滤。

## 5. 发布门槛

```bash
npm test --workspace backend
npm run build
npm run test:e2e
npm audit --omit=dev
npx react-doctor@latest --verbose --diff
```

确认生产依赖审计、Worker `/api/health`、`/api/capabilities`、CORS 拒绝测试、真实登录、SSE/轮询降级、任务主链路和浏览器错误日志后，只使用：

```bash
pinme save
```

发布后再次核对 health 中的 auth provider、settlement mode、contract address 和 realtime 字段，避免前端与 Worker 配置漂移。
