# YD 奖励与治理凭证设计

## 架构边界

```text
AgentMeshEscrow -> successful settlement -> reward_activities
reward_activities -> epoch calculator -> allocations + Merkle proofs
Treasury-funded YD -> YDRewardDistributor -> user wallet
user wallet -> YDStaking -> non-transferable Votes checkpoints
past block votes -> D1 governance snapshot -> public weighted voting
```

Escrow 合约、任务结算资产和 YD 合约之间没有调用关系。任务结算只产生幂等贡献事件。

## 合约

### `YDRewardDistributor`

- `publishEpoch` 仅允许 Root 管理角色调用，且 Root 一次写入后不可变。
- 发布前用 `balanceOf(this) >= outstandingCommitments + totalAllocation` 验证 Treasury 预存。
- leaf 为 `keccak256(abi.encode(chainId, distributor, epochId, account, amount))`，树节点使用排序 pair hash。
- `claim` 使用 checks-effects-interactions、ReentrancyGuard、SafeERC20 和唯一 claimed 标记。
- 领取截止后 Treasury 可 sweep 该 epoch 的未领取余额；只能 recover 未承诺的 excess。

### `YDStaking`

- 持有锁定 YD，不发行可转让凭证。
- 使用 OpenZeppelin `Votes` 管理委托、`getPastVotes` 和总 Power checkpoint。
- 原始 voting units 来自锁仓量、锁期和信誉系数；首次锁仓自动 self-delegate，之后可公开委托。
- 账户验证、信誉更新、暂停分别使用独立 AccessControl 角色。
- 用户退出时先归零 Power，再转出 YD；暂停态支持紧急退出。

### `TestYDToken`

- 仅测试网；constructor 固定一次性 supply，之后不存在 mint 接口。

## 奖励公式

Worker 使用整数微分数，避免浮点漂移：

```text
base = sqrt(normalized settled asset amount)
score = base × roleBps × qualityBps / 10_000²
effectiveScore = min(epochAccountCap, sum(valid activities))
allocation = floor(epochPool × effectiveScore / totalEffectiveScore)
```

余数按 `(score desc, userId asc)` 的稳定顺序逐最小单位分配，保证总和严格等于 epoch pool。每个活动保存公式版本、来源、原资产、金额和可解释 breakdown。

## D1 状态

- Epoch：`draft -> computed -> published -> expired`。
- Allocation：保存 wallet、amount base units、leaf、proof、claim tx。
- Staking position：Worker 验证链上事件后的 read model，不作为合约真相源。
- Governance proposal：`active -> succeeded | defeated | quorum_failed | cancelled`；首版不自动 execute。
- Proposal snapshot：保存 block number、delegate wallet、Power 和 profile 绑定；后续状态变化不回写。

## API

- `GET /api/yd/config`：公开网络、合约、decimals、测试网和风险说明。
- `GET /api/yd/overview`：当前用户奖励、仓位和治理摘要。
- `GET /api/yd/epochs/:id/allocations`：公开分配清单（完整钱包、分数、金额与 leaf hash，不返回平台 user ID 或身份数据）。
- `POST /api/yd/claims/sync`：验证 `RewardClaimed` 后幂等登记。
- `POST /api/yd/staking/sync`：验证 staking/delegation 事件后更新 read model。
- `GET /api/yd/governance/proposals`：公开提案、快照和投票。
- `POST /api/yd/governance/proposals/:id/votes`：按冻结 Power 投票。
- 管理员：创建/计算/发布 epoch，创建/finalize 治理提案，登记验证账户与信誉参数。

## 前端

`YD Finance` 使用一个产品工作台而不是后台表格：顶部测试网与资产边界，左侧奖励/领取，右侧锁仓与 Power，下方治理提案。链上按钮调用 viem/现有钱包 provider，成功 receipt 再同步 Worker。

## 回滚与部署

- D1 迁移只新增表与索引，不修改 Escrow 数据。
- 新合约独立部署；未配置地址时 Worker/前端保持只读“等待配置”，不降级为伪领取。
- 若旧 YD 审计不通过，可部署固定供应测试 YD，不影响任务结算。
- 本地实现与 QA 完成后仍不自动部署；生产或 Sepolia 部署需要单独授权和 Phase 0 参数。
