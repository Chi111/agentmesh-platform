# YD 奖励与治理凭证评审

结论：ALLOW  
时间：2026-08-23 16:35 +08:00

## 第一轮：资产、结算与领取边界

- `AgentMeshEscrow` 未被修改；YD Distributor 只能使用 Treasury 预存余额，不具备 mint 能力，也不能提取其他 epoch 的承诺余额。
- 贡献活动只在验收和原资产结算成功的原子批次中写入，来源键唯一；退款、失败和未结算路径不会生成任务奖励。
- Merkle leaf 绑定 chain ID、Distributor、epoch、钱包和数量；固定池精确分配且剔除 0 额度 leaf，重复领取、伪造 proof、超额承诺和过期领取由合约拒绝。
- 历史有效领取即使在 sweep 后才同步，也只能凭真实 `RewardClaimed` 事件纠正 D1 状态，不会触发第二次转账。
- 每条贡献活动保存公式版本，epoch 只消费同版本活动，避免未来公式升级混算。

## 第二轮：Power、身份与治理边界

- 未认证钱包不能锁仓或委托；撤销认证立即清零原始 Power，过期锁仓可由任意 keeper 写入清零 checkpoint。
- 治理快照只接受确认深度后的历史区块，并逐钱包校验过期/撤销 Power；签名委托同时校验 signer 与 delegatee 的认证状态。
- Worker 从所有已绑定钱包重建委托来源，并要求与 `getPastVotes` 完全一致；未知/未绑定来源、撤销目标的残留票权和重复钱包身份都会阻止快照。
- 投票使用冻结 electorate、钱包与用户双唯一键；当前绑定钱包必须与快照钱包一致。投票只记录结果，不自动移动 Treasury 资金或执行任意 payload。
- Review 中发现的过期 Power、未确认快照、0 额度 allocation、未知委托来源、换钱包投票和 sweep 后迟同步问题均已修复并加入回归覆盖。

## Reviewer 输出

```json
{"verdict":"ALLOW","issues":[],"p0Issues":[],"summary":"Phase 1/2 的资产隔离、Merkle 领取、锁仓 Power、委托对账和生态治理边界通过两轮聚焦评审，未发现剩余阻塞或 P0 问题。"}
```

外部 `codex review --uncommitted` 因工作区包含大量既有未提交改动，无法可靠限定到本功能并进入无关 DAG/DAO 代码，已主动中止，不计作通过证据。最终结论来自上述聚焦评审和自动化验证。
