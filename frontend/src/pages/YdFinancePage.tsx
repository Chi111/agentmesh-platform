import {
  BadgeCheck,
  CheckCircle2,
  Coins,
  ExternalLink,
  Gift,
  History,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Vote,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../services/api';
import { formatYdUnits, getYdWalletBalance } from '../services/ydFinance';
import type { EcosystemProposalType, EcosystemVoteChoice, RewardEpoch, YdFinanceOverview } from '../types/domain';

const roleLabel = { requester: '任务方贡献', agent_owner: 'Agent 交付', arbitrator: '仲裁贡献' } as const;
const proposalTypeLabel: Record<EcosystemProposalType, string> = {
  reward_release: '周期释放',
  reward_weights: '奖励权重',
  ecosystem_grant: '生态基金',
  development: '开发提案',
  platform_parameter: '平台参数',
};
const voteLabel: Record<EcosystemVoteChoice, string> = { for: '赞成', against: '反对', abstain: '弃权' };

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}

function shortAddress(value: string | null | undefined) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '未配置';
}

function powerPercent(value: string, total: string) {
  const numerator = BigInt(value || '0');
  const denominator = BigInt(total || '0');
  return denominator > 0n ? Number(numerator * 10_000n / denominator) / 100 : 0;
}

function formatPower(value: string) {
  try {
    const power = BigInt(value || '0');
    if (power <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(power).toLocaleString('zh-CN');
    const digits = power.toString();
    const group = Math.floor((digits.length - 1) / 3);
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    const integerDigits = digits.length - group * 3;
    const fraction = digits.slice(integerDigits, integerDigits + 2).replace(/0+$/, '');
    return `${digits.slice(0, integerDigits)}${fraction ? `.${fraction}` : ''}${suffixes[group] ?? `e${group * 3}`}`;
  } catch {
    return '0';
  }
}

export function YdFinancePage() {
  const { profile, walletAddress, linkedWalletAddress, linkWallet, ydWalletEnabled, submitYdAction } = useAuth();
  const [overview, setOverview] = useState<YdFinanceOverview | null>(null);
  const [walletBalance, setWalletBalance] = useState('0');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('10');
  const [durationDays, setDurationDays] = useState(180);
  const [delegatee, setDelegatee] = useState('');
  const [syncTxHash, setSyncTxHash] = useState('');
  const [adminWallet, setAdminWallet] = useState('');
  const [adminVerified, setAdminVerified] = useState(true);
  const [adminReputationBps, setAdminReputationBps] = useState(10_000);
  const [voteReason, setVoteReason] = useState<Record<string, string>>({});
  const [voteChoices, setVoteChoices] = useState<Record<string, EcosystemVoteChoice>>({});
  const [epochForm, setEpochForm] = useState({ epochNumber: 1, startsAt: '', endsAt: '', claimEndsAt: '', totalReward: '10000', accountScoreCap: 1_000_000 });
  const [proposalForm, setProposalForm] = useState({ proposalType: 'development' as EcosystemProposalType, title: '', description: '', endsAt: '', quorumBps: 2_000, approvalBps: 5_001 });
  const identityWallet = walletAddress ?? linkedWalletAddress ?? null;
  const isAdmin = profile?.role === 'admin';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await api.getYdOverview();
      setOverview(next);
      if (identityWallet && ydWalletEnabled) setWalletBalance(await getYdWalletBalance(identityWallet));
      else setWalletBalance('0');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'YD Finance 加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [profile?.id, identityWallet, ydWalletEnabled]);

  const allocations = useMemo(() => (overview?.allocations ?? []).map((allocation) => ({
    allocation,
    epoch: overview?.epochs.find((item) => item.id === allocation.epochId) ?? null,
  })), [overview]);
  const claimable = allocations.filter(({ allocation, epoch }) => allocation.status === 'unclaimed' && epoch?.status === 'published' && Date.parse(epoch.claimEndsAt) >= Date.now());
  const staking = overview?.staking ?? null;
  const hasStake = Boolean(staking && staking.amountUnits !== '0');

  const run = async (key: string, operation: () => Promise<string | void>, success: string) => {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      const result = await operation();
      setMessage(result ? `${success} · ${result.slice(0, 12)}…` : success);
      await load();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : '操作失败，请稍后重试。');
    } finally {
      setBusy('');
    }
  };

  const claim = async (epoch: RewardEpoch, allocation: (typeof allocations)[number]['allocation']) => {
    await run(`claim:${epoch.id}`, async () => {
      const txHash = await submitYdAction({ type: 'claim', epochNumber: epoch.epochNumber, amountUnits: allocation.amountUnits, proof: allocation.proof });
      await api.syncYdClaim(epoch.id, txHash);
      return txHash;
    }, 'YD 奖励已领取并完成链上核验');
  };

  const changeStake = async (event: FormEvent) => {
    event.preventDefault();
    await run('stake', async () => {
      const txHash = await submitYdAction(hasStake
        ? { type: 'increase', amount }
        : { type: 'lock', amount, durationDays });
      await api.syncYdStaking(txHash);
      return txHash;
    }, hasStake ? '锁仓数量已增加' : 'YD 已锁定并生成 Power');
  };

  const syncStaking = async () => {
    await run('sync', async () => {
      await api.syncYdStaking(syncTxHash.trim());
      return syncTxHash.trim();
    }, '链上锁仓状态已同步');
  };

  const castVote = async (proposalId: string) => {
    const reason = voteReason[proposalId]?.trim() ?? '';
    if (reason.length < 8) return setError('投票理由至少需要 8 个字。');
    await run(`vote:${proposalId}`, async () => {
      await api.castYdVote(proposalId, voteChoices[proposalId] ?? 'for', reason);
    }, '治理投票已记录，当前提案快照不会再变化');
  };

  const createEpoch = async (event: FormEvent) => {
    event.preventDefault();
    if (!overview) return;
    await run('create-epoch', async () => {
      await api.createRewardEpoch({
        epochNumber: epochForm.epochNumber,
        startsAt: new Date(epochForm.startsAt).toISOString(),
        endsAt: new Date(epochForm.endsAt).toISOString(),
        claimEndsAt: new Date(epochForm.claimEndsAt).toISOString(),
        totalRewardUnits: parseUnits(epochForm.totalReward, overview.config.decimals).toString(),
        accountScoreCap: epochForm.accountScoreCap,
        rules: { settlementRequired: true, disputesExcluded: true, accountCap: true },
      });
    }, '奖励周期草稿已创建');
  };

  const computeEpoch = async (epoch: RewardEpoch) => {
    await run(`compute:${epoch.id}`, async () => { await api.computeRewardEpoch(epoch.id); }, '奖励清单与 Merkle Root 已生成');
  };

  const publishEpoch = async (epoch: RewardEpoch) => {
    await run(`publish:${epoch.id}`, async () => {
      const txHash = await submitYdAction({ type: 'publish_epoch', epoch });
      await api.publishRewardEpoch(epoch.id, txHash);
      return txHash;
    }, '奖励 Root 已发布并通过 Worker 核验');
  };

  const expireEpoch = async (epoch: RewardEpoch) => {
    await run(`expire:${epoch.id}`, async () => {
      const txHash = await submitYdAction({ type: 'sweep_epoch', epochNumber: epoch.epochNumber });
      await api.expireRewardEpoch(epoch.id, txHash);
      return txHash;
    }, '过期周期已清扫，未领取分配已失效');
  };

  const verifyAccount = async () => {
    await run('verify-account', async () => submitYdAction({
      type: 'verify_account',
      account: adminWallet.trim(),
      verified: adminVerified,
    }), adminVerified ? '钱包已通过链上认证' : '钱包链上认证已撤销');
  };

  const setReputation = async () => {
    await run('set-reputation', async () => submitYdAction({
      type: 'set_reputation',
      account: adminWallet.trim(),
      reputationBps: adminReputationBps,
    }), '链上信誉系数已更新');
  };

  const syncExpiredPower = async () => {
    await run('sync-expired-power', async () => submitYdAction({
      type: 'sync_expired_power',
      account: adminWallet.trim(),
    }), '过期锁仓 Power 已清零并写入检查点');
  };

  const createProposal = async (event: FormEvent) => {
    event.preventDefault();
    await run('create-proposal', async () => {
      await api.createYdProposal({ ...proposalForm, endsAt: new Date(proposalForm.endsAt).toISOString(), payload: {} });
    }, '提案已创建并冻结历史区块 Power 快照');
  };

  if (loading && !overview) return <div className="panel flex min-h-72 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步奖励、锁仓与治理状态…</div>;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="YD Rewards & Governance"
        title="YD Finance"
        description="任务结算、YD 奖励与治理 Power 独立记账。这里不接触任务托管资金，也不提供真实收益或 APY。"
        actions={<span className="mono-chip">PHASE 1 + 2 · {overview?.config.testnet ? 'TESTNET' : 'NETWORK'}</span>}
      />

      <section className="mesh-grid overflow-hidden rounded-2xl bg-ink p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl"><p className="flex items-center gap-2 text-xs font-semibold text-lime"><ShieldAlert size={16} />四套账严格隔离</p><h2 className="mt-3 text-xl font-semibold">YD 是贡献奖励与治理凭证，不是任务支付资产</h2><p className="mt-2 text-sm leading-6 text-white/50">只有已验收、已结算且无未决争议的贡献进入周期评分。Earn Vault 尚未启用，页面不会展示虚构 APY。</p></div>
          <div className="grid min-w-[280px] grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-[9px] uppercase tracking-wider text-white/30">YD Balance</p><p className="mt-2 font-mono text-lg">{formatYdUnits(walletBalance)} YD</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-[9px] uppercase tracking-wider text-white/30">Governance Power</p><p className="mt-2 font-mono text-lg">{formatPower(staking?.votingPower ?? '0')}</p></div></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/45"><span className="rounded-full border border-white/10 px-3 py-1.5">Token {shortAddress(overview?.config.tokenAddress)}</span><span className="rounded-full border border-white/10 px-3 py-1.5">Distributor {shortAddress(overview?.config.distributorAddress)}</span><span className="rounded-full border border-white/10 px-3 py-1.5">Staking {shortAddress(overview?.config.stakingAddress)}</span></div>
      </section>

      {!overview?.config.configured || !ydWalletEnabled ? <section className="rounded-2xl border border-warning/30 bg-warning/10 p-5"><p className="font-semibold">YD 测试网合约尚未完整配置</p><p className="mt-2 text-sm leading-6 text-muted">Phase 0 的旧 YD 地址、权限和持币分布还需要审计。当前代码已支持 Sepolia 映射合约，但在地址写入 Worker Secret / 前端公开配置前禁止链上操作。</p></section> : !identityWallet ? <section className="rounded-2xl border border-cyan/25 bg-cyan/[0.06] p-5"><p className="font-semibold">连接认证钱包后操作 YD</p><p className="mt-2 text-sm text-muted">领取、锁仓和委托都必须由 AgentMesh 已绑定的钱包签名。</p><button type="button" className="btn-primary mt-4" onClick={() => void linkWallet()}><Landmark size={16} />连接钱包</button></section> : null}
      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}
      {message ? <p className="rounded-xl border border-lime/30 bg-lime/10 p-4 text-sm" role="status"><CheckCircle2 className="mr-2 inline" size={16} />{message}</p> : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-5"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Gift size={18} /></span><div><h2 className="font-semibold">周期奖励</h2><p className="mt-1 text-xs text-muted">固定 Treasury 池 · Merkle Claim · 禁止重复领取</p></div></div><span className="font-mono text-xs text-cyan">{claimable.length} CLAIMABLE</span></div>
          <div className="mt-5 space-y-3">{allocations.length ? allocations.map(({ allocation, epoch }) => <article className="rounded-2xl border border-line p-4" key={allocation.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted">Epoch {epoch?.epochNumber ?? '—'} · {epoch?.status ?? 'unknown'}</p><p className="mt-2 font-mono text-2xl font-semibold">{formatYdUnits(allocation.amountUnits)} <span className="text-sm text-cyan">YD</span></p><p className="mt-2 text-xs text-muted">有效贡献分 {allocation.effectiveScore.toLocaleString()} · 领取截止 {formatDate(epoch?.claimEndsAt ?? null)}</p></div>{allocation.status === 'claimed' ? <span className="rounded-full bg-lime/20 px-3 py-1.5 text-xs font-semibold">已领取</span> : epoch?.status === 'published' ? <button type="button" className="btn-primary" disabled={Boolean(busy) || !ydWalletEnabled} onClick={() => void claim(epoch, allocation)}>{busy === `claim:${epoch.id}` ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}领取 YD</button> : <span className="rounded-full bg-canvas px-3 py-1.5 text-xs text-muted">等待发布</span>}</div></article>) : <div className="rounded-2xl border border-dashed border-line bg-canvas/40 p-8 text-center"><Gift className="mx-auto text-cyan" size={24} /><p className="mt-4 text-sm font-semibold">暂无周期分配</p><p className="mt-2 text-xs leading-5 text-muted">完成并结算任务后，贡献会进入下一周期计算；奖励不是逐任务即时铸造。</p></div>}</div>
          <div className="mt-6 border-t border-line pt-5"><div className="flex items-center gap-2"><History size={16} /><h3 className="text-sm font-semibold">贡献来源</h3></div>{overview?.activities.length ? <div className="mt-3 divide-y divide-line">{overview.activities.slice(0, 12).map((activity) => <div className="flex items-center justify-between gap-4 py-3" key={activity.id}><div><p className="text-xs font-semibold">{roleLabel[activity.role]} · {activity.missionId ?? activity.disputeId ?? '平台治理'}</p><p className="mt-1 text-[10px] text-muted">{activity.asset} {activity.settledAmount.toLocaleString()} · 质量 {activity.qualityBps / 100}% · 惩罚 {activity.penaltyBps / 100}%</p></div><span className="font-mono text-xs text-cyan">{activity.scoreMicros.toLocaleString()} pts</span></div>)}</div> : <p className="mt-3 text-xs text-muted">当前账户还没有符合条件的已结算贡献。</p>}</div>
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-line pb-5"><span className="flex size-10 items-center justify-center rounded-xl bg-lime/15"><LockKeyhole size={18} /></span><div><h2 className="font-semibold">锁仓与 Power</h2><p className="mt-1 text-xs text-muted">非转让 Power · 30–730 天 · 历史区块快照</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-canvas p-4"><p className="text-[10px] text-muted">已锁定</p><p className="mt-2 font-mono text-lg">{formatYdUnits(staking?.amountUnits ?? '0')} YD</p></div><div className="rounded-xl bg-canvas p-4"><p className="text-[10px] text-muted">信誉系数</p><p className="mt-2 font-mono text-lg">{((staking?.reputationBps ?? 10_000) / 10_000).toFixed(2)}×</p></div></div>
          <p className="mt-3 text-xs leading-5 text-muted">解锁时间 {formatDate(staking?.unlockTime ?? null)} · 委托至 {shortAddress(staking?.delegatedTo ?? identityWallet)}</p>
          <form className="mt-5" onSubmit={changeStake}><div className="grid gap-3 sm:grid-cols-2"><label><span className="field-label">{hasStake ? '增加数量' : '锁定数量'}</span><input className="field" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{!hasStake ? <label><span className="field-label">锁定天数</span><input className="field" type="number" min={30} max={730} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} /></label> : null}</div><button className="btn-primary mt-4 w-full" type="submit" disabled={Boolean(busy) || !ydWalletEnabled}>{busy === 'stake' ? <LoaderCircle className="animate-spin" size={15} /> : <LockKeyhole size={15} />}{hasStake ? '增加锁仓' : '批准 YD 并锁仓'}</button></form>
          {hasStake && staking ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('extend', async () => { const tx = await submitYdAction({ type: 'extend', durationDays }); await api.syncYdStaking(tx); return tx; }, '锁定期限已延长')}><RefreshCw size={15} />延长至 {durationDays} 天</button><button type="button" className="btn-secondary" disabled={Boolean(busy) || Boolean(staking.unlockTime && Date.parse(staking.unlockTime) > Date.now())} onClick={() => void run('withdraw', async () => { const tx = await submitYdAction({ type: 'withdraw' }); await api.syncYdStaking(tx); return tx; }, '到期 YD 已取回')}><Coins size={15} />到期解锁</button></div> : null}
          <div className="mt-5 border-t border-line pt-5"><label><span className="field-label">委托 Power</span><div className="flex gap-2"><input className="field min-w-0" value={delegatee} onChange={(event) => setDelegatee(event.target.value)} placeholder={identityWallet ?? '0x…'} /><button type="button" className="btn-secondary shrink-0" disabled={Boolean(busy)} onClick={() => void run('delegate', async () => { const tx = await submitYdAction({ type: 'delegate', delegatee: delegatee || identityWallet || '' }); await api.syncYdStaking(tx); return tx; }, 'Power 委托已更新')}>委托</button></div></label></div>
          <div className="mt-5 rounded-xl border border-dashed border-line p-4"><p className="text-xs font-semibold">同步认证或历史锁仓交易</p><p className="mt-1 text-[10px] leading-4 text-muted">管理员认证钱包后，可在这里粘贴交易哈希，Worker 会核验事件、确认数和目标钱包。</p><div className="mt-3 flex gap-2"><input className="field min-w-0 font-mono text-xs" value={syncTxHash} onChange={(event) => setSyncTxHash(event.target.value)} placeholder="0x…" /><button type="button" className="btn-secondary shrink-0" disabled={Boolean(busy) || syncTxHash.length !== 66} onClick={() => void syncStaking()}>{busy === 'sync' ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}同步</button></div></div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Vote size={18} /></span><div><h2 className="font-semibold">生态治理</h2><p className="mt-1 text-xs text-muted">Power 加权 · 历史区块快照 · 一钱包一票</p></div></div><span className="text-xs font-semibold text-warning">任务争议仍由仲裁委员会一人一票</span></div>
        <div className="grid gap-4 p-5 lg:grid-cols-2 sm:p-6">{overview?.governance.length ? overview.governance.map(({ proposal, currentUser }) => <article className="rounded-2xl border border-line p-5" key={proposal.id}><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[9px] text-muted">PROPOSAL #{proposal.proposalNumber} · BLOCK {proposal.snapshotBlock}</p><h3 className="mt-2 font-semibold">{proposal.title}</h3></div><span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${proposal.status === 'active' ? 'bg-cyan/10 text-cyan' : 'bg-canvas text-muted'}`}>{proposal.status}</span></div><p className="mt-3 text-xs leading-5 text-muted">{proposal.description}</p><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-lime/10 p-3"><p className="font-mono text-sm">{powerPercent(proposal.forPower, proposal.eligiblePower)}%</p><p className="mt-1 text-[9px] text-muted">赞成</p></div><div className="rounded-xl bg-danger/5 p-3"><p className="font-mono text-sm">{powerPercent(proposal.againstPower, proposal.eligiblePower)}%</p><p className="mt-1 text-[9px] text-muted">反对</p></div><div className="rounded-xl bg-canvas p-3"><p className="font-mono text-sm">{powerPercent(proposal.abstainPower, proposal.eligiblePower)}%</p><p className="mt-1 text-[9px] text-muted">弃权</p></div></div>{currentUser.canVote ? <div className="mt-5"><div className="grid grid-cols-3 gap-2">{(['for', 'against', 'abstain'] as const).map((choice) => <button type="button" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${(voteChoices[proposal.id] ?? 'for') === choice ? 'border-cyan bg-cyan/[0.06]' : 'border-line'}`} onClick={() => setVoteChoices((state) => ({ ...state, [proposal.id]: choice }))} key={choice}>{voteLabel[choice]}</button>)}</div><textarea className="field mt-3 min-h-20" value={voteReason[proposal.id] ?? ''} onChange={(event) => setVoteReason((state) => ({ ...state, [proposal.id]: event.target.value }))} placeholder="公开投票理由，至少 8 个字…" /><button type="button" className="btn-primary mt-3 w-full" disabled={Boolean(busy)} onClick={() => void castVote(proposal.id)}>{busy === `vote:${proposal.id}` ? <LoaderCircle className="animate-spin" size={14} /> : <Vote size={14} />}提交不可修改的投票</button></div> : <div className="mt-5 rounded-xl bg-canvas p-4 text-center"><BadgeCheck className="mx-auto text-cyan" size={18} /><p className="mt-2 text-xs font-semibold">{currentUser.hasVoted ? `已投 ${currentUser.choice ? voteLabel[currentUser.choice] : ''}` : currentUser.eligible ? '投票窗口已关闭' : '你不在本提案 Power 快照中'}</p></div>}</article>) : <div className="col-span-full rounded-2xl border border-dashed border-line bg-canvas/40 p-9 text-center"><Vote className="mx-auto text-cyan" size={24} /><p className="mt-4 font-semibold">暂无生态治理提案</p><p className="mt-2 text-xs text-muted">首版只治理奖励规则、生态基金、开发提案和非资金安全参数。</p></div>}</div>
      </section>

      {isAdmin ? (
        <details className="panel overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
            <span>
              <span className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} className="text-cyan" />链上账户与 Treasury 操作</span>
              <span className="mt-1 block text-xs text-muted">这些按钮只发起钱包签名；当前钱包还必须拥有对应的合约角色。</span>
            </span>
            <span className="mono-chip">ONCHAIN ADMIN</span>
          </summary>
          <div className="grid gap-6 border-t border-line p-5 xl:grid-cols-2 sm:p-6">
            <div>
              <h3 className="font-semibold">认证钱包与信誉</h3>
              <label className="mt-4 block">
                <span className="field-label">AgentMesh 绑定钱包</span>
                <input className="field font-mono text-xs" value={adminWallet} onChange={(event) => setAdminWallet(event.target.value)} placeholder="0x…" />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-label">认证状态</span>
                  <select className="field" value={adminVerified ? 'verified' : 'revoked'} onChange={(event) => setAdminVerified(event.target.value === 'verified')}>
                    <option value="verified">通过认证</option>
                    <option value="revoked">撤销认证</option>
                  </select>
                </label>
                <label>
                  <span className="field-label">信誉 BPS（5000–15000）</span>
                  <input className="field" type="number" min={5_000} max={15_000} value={adminReputationBps} onChange={(event) => setAdminReputationBps(Number(event.target.value))} />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" disabled={Boolean(busy) || !ydWalletEnabled} onClick={() => void verifyAccount()}><BadgeCheck size={15} />写入认证</button>
                <button type="button" className="btn-secondary" disabled={Boolean(busy) || !ydWalletEnabled} onClick={() => void setReputation()}><Sparkles size={15} />更新信誉</button>
                <button type="button" className="btn-secondary" disabled={Boolean(busy) || !ydWalletEnabled} onClick={() => void syncExpiredPower()}><RefreshCw size={15} />清理过期 Power</button>
              </div>
              <p className="mt-3 text-[10px] leading-5 text-muted">认证或信誉调整后，目标用户需在本页用交易哈希同步。创建提案前若提示 Power 待清理，请先对过期钱包写入清零检查点，等待确认区块后重试。</p>
            </div>
            <div>
              <h3 className="font-semibold">过期奖励回收</h3>
              <p className="mt-2 text-xs leading-5 text-muted">仅领取窗口已经结束的已发布周期可清扫；合约会把未领取 YD 退回 Treasury。</p>
              <div className="mt-4 space-y-2">
                {overview?.epochs.filter((epoch) => epoch.status === 'published' && Date.parse(epoch.claimEndsAt) < Date.now()).map((epoch) => (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3" key={epoch.id}>
                    <div><p className="text-xs font-semibold">Epoch {epoch.epochNumber}</p><p className="mt-1 text-[10px] text-muted">截止 {formatDate(epoch.claimEndsAt)}</p></div>
                    <button type="button" className="btn-secondary" disabled={Boolean(busy) || !ydWalletEnabled} onClick={() => void expireEpoch(epoch)}><Coins size={14} />清扫</button>
                  </div>
                ))}
                {!overview?.epochs.some((epoch) => epoch.status === 'published' && Date.parse(epoch.claimEndsAt) < Date.now()) ? <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-muted">暂无可清扫周期</p> : null}
              </div>
            </div>
          </div>
        </details>
      ) : null}

      {isAdmin ? <details className="panel overflow-hidden"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6"><span><span className="flex items-center gap-2 font-semibold"><BadgeCheck size={17} className="text-cyan" />治理运营工具</span><span className="mt-1 block text-xs text-muted">管理员钱包仍需拥有合约角色；Worker 只记录核验后的链上结果。</span></span><span className="mono-chip">ADMIN</span></summary><div className="grid gap-6 border-t border-line p-5 xl:grid-cols-2 sm:p-6"><form onSubmit={createEpoch}><h3 className="font-semibold">新建奖励周期</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="field-label">周期编号</span><input className="field" type="number" value={epochForm.epochNumber} onChange={(event) => setEpochForm({ ...epochForm, epochNumber: Number(event.target.value) })} /></label><label><span className="field-label">YD 奖励池</span><input className="field" value={epochForm.totalReward} onChange={(event) => setEpochForm({ ...epochForm, totalReward: event.target.value })} /></label><label><span className="field-label">统计开始</span><input className="field" type="datetime-local" value={epochForm.startsAt} onChange={(event) => setEpochForm({ ...epochForm, startsAt: event.target.value })} /></label><label><span className="field-label">统计结束</span><input className="field" type="datetime-local" value={epochForm.endsAt} onChange={(event) => setEpochForm({ ...epochForm, endsAt: event.target.value })} /></label><label className="sm:col-span-2"><span className="field-label">领取截止</span><input className="field" type="datetime-local" value={epochForm.claimEndsAt} onChange={(event) => setEpochForm({ ...epochForm, claimEndsAt: event.target.value })} /></label></div><button className="btn-primary mt-4" disabled={Boolean(busy)} type="submit"><Gift size={15} />创建周期</button><div className="mt-5 space-y-2">{overview?.epochs.map((epoch) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas p-3" key={epoch.id}><div><p className="text-xs font-semibold">Epoch {epoch.epochNumber} · {epoch.status}</p><p className="mt-1 font-mono text-[9px] text-muted">{epoch.merkleRoot ? `${epoch.merkleRoot.slice(0, 14)}…` : 'ROOT PENDING'}</p></div>{epoch.status === 'draft' ? <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void computeEpoch(epoch)}>计算 Root</button> : epoch.status === 'computed' ? <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void publishEpoch(epoch)}>链上发布</button> : null}</div>)}</div></form><form onSubmit={createProposal}><h3 className="font-semibold">创建生态提案</h3><div className="mt-4 space-y-3"><label><span className="field-label">类型</span><select className="field" value={proposalForm.proposalType} onChange={(event) => setProposalForm({ ...proposalForm, proposalType: event.target.value as EcosystemProposalType })}>{Object.entries(proposalTypeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span className="field-label">标题</span><input className="field" value={proposalForm.title} onChange={(event) => setProposalForm({ ...proposalForm, title: event.target.value })} /></label><label><span className="field-label">说明</span><textarea className="field min-h-28" value={proposalForm.description} onChange={(event) => setProposalForm({ ...proposalForm, description: event.target.value })} /></label><label><span className="field-label">投票截止</span><input className="field" type="datetime-local" value={proposalForm.endsAt} onChange={(event) => setProposalForm({ ...proposalForm, endsAt: event.target.value })} /></label></div><button className="btn-primary mt-4" disabled={Boolean(busy)} type="submit"><Vote size={15} />创建并快照 Power</button><p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted"><ExternalLink size={14} className="mt-0.5 shrink-0" />管理员链上认证和信誉设置由拥有 ACCOUNT_VERIFIER / REPUTATION_MANAGER 角色的钱包完成；用户随后通过交易哈希同步。</p></form></div></details> : null}
    </div>
  );
}
