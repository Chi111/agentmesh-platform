# YD 奖励与治理凭证需求

状态：已完成（未部署）
日期：2026-08-23

## 目标

在不修改 `AgentMeshEscrow`、不混用任务托管资金的前提下，为 AgentMesh 增加首版 YD 周期奖励、Merkle 领取、YD 锁仓、治理 Power 和生态提案投票。

本期实现 Phase 1 与 Phase 2。Phase 0 的旧 YD 合约地址、链、decimals、供应量、管理员、暂停和增发权限作为部署前审计门槛；真实 DeFi Earn Vault 不在本期。

## 四套账隔离

- 任务账：mUSDC / sETH / CREDIT 继续由现有 Escrow 与结算账本处理。
- 收益账：本期不提供真实 Earn，不接触任务资金。
- YD 奖励账：Treasury 预存固定 YD，Distributor 只能按已发布 Merkle Root 发放，不能增发。
- 治理 Power 账：用户主动锁定 YD 后产生不可转让 Power，并按区块保存历史快照。

## YD 合约适配

- Distributor 与 Staking 只依赖标准 ERC-20，不假设拥有 YD mint 权限。
- 提供仅用于 Sepolia 的固定供应 `TestYDToken`；构造时一次性铸给 Treasury，之后不可增发。
- 旧 YD 未完成 Phase 0 审计前不得将生产地址写入部署配置。
- 同链普通 ERC-20 直接作为锁仓资产；不同链首版不得桥接或映射真实余额。

## 周期奖励

- 只有已验收且原资产结算成功的任务产生奖励活动；重复验收不得重复记分。
- 退款、未决争议、失败或未结算任务不得进入可领取分配。
- 首版奖励对象包括任务方、完成任务的 Agent 所有者以及完成投票并形成最终裁决的仲裁委员。
- 贡献分以已结算金额平方根为基数，结合角色、Agent 成功质量和惩罚；公式版本和参数随 epoch 固化。
- 每个 epoch 有固定 YD 池、单账户分数上限、开始/结束/领取截止时间和公开分配清单。
- Worker 生成确定性 Merkle Root、leaf 和 proof；leaf 必须绑定 chain ID、Distributor 地址、epoch、钱包和数量，阻止跨部署重放。
- Root 发布后不可修改；用户自行签名领取，合约先标记领取再转账，禁止重复领取。
- Distributor 必须检查预存余额覆盖全部未领取承诺，过期后只允许 Treasury 收回该 epoch 未领取余额。

## 锁仓与 Power

- 钱包必须绑定 AgentMesh 认证账户，并由账户验证角色登记后才能锁仓。
- 每个钱包一个可增加、可续期、到期可退出的锁仓仓位；锁期 30 天至 730 天。
- Power 公式为 `sqrt(normalized locked YD) × duration coefficient × reputation coefficient`，并受单账户上限约束。
- 期限系数从 1x 线性增长至 4x；信誉系数默认 1x，仅能由受限角色在 0.5x 至 1.5x 内更新。
- 锁定期间对应 YD 不可转移；暂停时允许用户紧急退出，但历史 Power 快照不改变。
- Power 与委托使用 OpenZeppelin Votes 风格的按区块 checkpoint；提案创建后使用过去区块快照，之后买入、锁仓、转账或委托不影响该提案。
- 委托事件、Power 变化和治理投票公开；任务争议仍使用现有仲裁委员会一人一票。

## 生态治理

- 提案范围仅限 YD 周期释放、奖励权重、生态基金、开发提案和非资金安全平台参数。
- 管理员创建提案时选择过去的快照区块，Worker 从 Staking 合约读取 `getPastVotes` 并冻结 electorate。
- 票型为赞成、反对、弃权；每个快照钱包只能投一次，票重等于冻结 Power。
- 法定人数和通过阈值随提案固化；弃权计入 quorum，不计入赞成/反对多数。
- 投票结果不自动执行 Treasury、合约升级或安全参数变更；执行必须另走管理员、多签和审计流程。

## Worker 与 D1

- 新增 `reward_epochs`、`reward_activities`、`reward_allocations`、`reward_claims`、`staking_positions`、`governance_proposals`、`governance_power_snapshots`、`governance_votes`。
- 任务验收与奖励活动写入同一 D1 batch；源事件键唯一，保证幂等。
- 所有链上 claim / stake sync 必须验证交易状态、目标合约、发送钱包、事件参数、chain ID 和确认数。
- 管理员创建/计算/发布 epoch 和创建/定案提案均需权限、状态 guard 和审计事件。
- 用户 API 只返回自己的领取 proof 与仓位；分配总表、Root、提案、快照和投票为公开可审计数据，不返回邮箱或身份令牌。

## 前端

- 新增独立 `YD Finance` 路由，不进入任务支付、启动或验收页面。
- 展示 YD 余额、可领取奖励、奖励来源、锁仓仓位、当前/已委托 Power、提案和公开票数。
- 支持真实领取、锁定、增加、续期、委托、退出和生态投票操作；链上操作后调用 Worker 验证同步。
- 未配置合约、未绑定钱包、余额不足、交易确认中、无奖励、无投票资格和错误状态必须有明确反馈。
- Sepolia 明确标识测试 YD、测试奖励率和无真实收益；不得展示 APY 或暗示保本。

## 安全验收

- 覆盖重复领取、伪造 proof、Root 超额承诺、过期领取和 Treasury 回收。
- 覆盖未验证钱包、锁仓上限、期限边界、提前退出、暂停紧急退出、委托和历史快照。
- 覆盖重复贡献、重复计算、结算失败不记分、单账户 cap、重复投票和快照后 Power 变化。
- 覆盖管理员越权、错误合约/钱包/链交易同步、重复同步和并发 finalize。
- 合约、Worker、D1、前端构建和浏览器关键流程通过；主网前仍要求独立智能合约审计和经济压力测试。

## 不在本阶段

- AgentMeshEarnVault、真实 USDC/ETH 收益、借贷、质押策略或收益聚合。
- 修改或升级 AgentMeshEscrow、使用托管资金投资、自动链上执行治理结果。
- 主网部署、旧 YD 跨链映射、治理代币增发、二次方投票、质押惩罚和多轮上诉。
- 未经用户明确授权的 `pinme save` 或合约部署。
