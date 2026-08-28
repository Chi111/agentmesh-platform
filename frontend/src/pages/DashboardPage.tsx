import { Activity, ArrowRight, Bot, CircleDollarSign, Clock3, Coins, Gift, GitBranch, LockKeyhole, Plus, ShieldCheck, Sparkles, Target, TrendingUp, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { BRAND } from '../constants/brand';
import { api } from '../services/api';
import { formatYdUnits } from '../services/ydFinance';
import { useAppStore } from '../store/useAppStore';
import type { YdFinanceOverview } from '../types/domain';
import { missionStatusMeta, routeForMission } from '../utils/missionState';
import { formatPaymentAmount, paymentToken } from '../utils/payments';

function compactPower(value: string) {
  try {
    const power = BigInt(value || '0');
    if (power < 1_000n) return power.toString();
    const units = [['T', 1_000_000_000_000n], ['B', 1_000_000_000n], ['M', 1_000_000n], ['K', 1_000n]] as const;
    const match = units.find(([, divisor]) => power >= divisor);
    if (!match) return power.toString();
    const [suffix, divisor] = match;
    const tenths = power * 10n / divisor;
    return `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ''}${suffix}`;
  } catch {
    return '0';
  }
}

function sumUnits(values: string[]) {
  return values.reduce((total, value) => {
    try { return total + BigInt(value || '0'); } catch { return total; }
  }, 0n).toString();
}

export function DashboardPage() {
  const missions = useAppStore((state) => state.missions);
  const agents = useAppStore((state) => state.agents);
  const activeMission = missions.find((mission) => mission.status === 'running' || mission.status === 'paused') ?? missions[0] ?? null;
  const storedStages = useAppStore((state) => activeMission ? state.missionStages[activeMission.id] : undefined);
  const detail = useAppStore((state) => activeMission ? state.missionDetails[activeMission.id] : undefined);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const running = missions.filter((mission) => mission.status === 'running' || mission.status === 'paused').length;
  const review = missions.filter((mission) => mission.status === 'review').length;
  const budgetTokens = [...new Set(missions.map((mission) => paymentToken(mission.paymentMethod)))];
  const averageSuccess = agents.length ? agents.reduce((total, agent) => total + agent.successRate, 0) / agents.length : 0;
  const stages = storedStages ?? [];
  const edges = detail?.edges ?? [];
  const rootCount = stages.filter((stage) => !edges.some((edge) => edge.targetStageId === stage.id)).length;
  const evidenceCount = detail?.events.length ?? 0;
  const [ydOverview, setYdOverview] = useState<YdFinanceOverview | null>(null);
  const [ydLoading, setYdLoading] = useState(true);

  useEffect(() => {
    if (!activeMission || detail) return;
    void loadMissionDetail(activeMission.id).catch(() => undefined);
  }, [activeMission, detail, loadMissionDetail]);

  useEffect(() => {
    let current = true;
    setYdLoading(true);
    void api.getYdOverview()
      .then((overview) => { if (current) setYdOverview(overview); })
      .catch(() => { if (current) setYdOverview(null); })
      .finally(() => { if (current) setYdLoading(false); });
    return () => { current = false; };
  }, []);

  const activeRoute = activeMission ? routeForMission(activeMission) : '/missions';
  const activeStatus = activeMission ? missionStatusMeta(activeMission) : null;
  const trustItems = [
    ['工作流状态', stages.length ? `${stages.filter((stage) => stage.status === 'done').length} / ${stages.length} 阶段完成` : '等待任务编排', stages.some((stage) => stage.status === 'done') ? 'lime' : 'muted'],
    ['执行证据', `${evidenceCount} 个真实事件`, evidenceCount ? 'cyan' : 'muted'],
    ['托管账本', detail?.escrow ? `${detail.escrow.amount} ${detail.escrow.token} · ${detail.escrow.status}` : '等待创建托管记录', detail?.escrow?.status === 'released' ? 'lime' : 'muted'],
  ];
  const previewStages = stages.slice(0, 4);
  const claimableAllocations = (ydOverview?.allocations ?? []).filter((allocation) => {
    const epoch = ydOverview?.epochs.find((item) => item.id === allocation.epochId);
    return allocation.status === 'unclaimed' && epoch?.status === 'published' && Date.parse(epoch.claimEndsAt) >= Date.now();
  });
  const claimableYd = formatYdUnits(sumUnits(claimableAllocations.map((allocation) => allocation.amountUnits)));
  const lockedYd = formatYdUnits(ydOverview?.staking?.amountUnits ?? '0');
  const governancePower = compactPower(ydOverview?.staking?.votingPower ?? '0');
  const activeProposals = (ydOverview?.governance ?? []).filter(({ proposal }) => proposal.status === 'active').length;

  return (
    <div className="page-stack space-y-8">
      <PageHeader
        eyebrow="Mission Control / 任务方"
        title="让复杂目标，沿着可信工作流推进"
        description={`描述结果，${BRAND.platform.name} 负责任务拆解、可信组队、执行监控与合约结算。你始终保留关键确认权。`}
        actions={
          <>
            <Link className="btn-secondary" to="/yd-finance"><Coins size={17} />{BRAND.contribution.navigationLabel}</Link>
            <Link className="btn-secondary" to="/agents"><Bot size={17} />浏览 Agent</Link>
            <Link className="btn-primary" to="/missions/new"><Plus size={17} />发布新任务</Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="关键指标">
        <MetricCard label="执行中" value={String(running)} detail="1 个阶段需要关注" icon={Activity} signal="cyan" />
        <MetricCard label="待验收" value={String(review)} detail="交付证据已就绪" icon={ShieldCheck} signal="lime" />
        <MetricCard label="任务预算" value={`${missions.length} 笔`} detail={budgetTokens.length ? `使用 ${budgetTokens.join(' / ')}` : '暂无托管预算'} icon={CircleDollarSign} />
        <MetricCard label="Agent 成功率" value={`${averageSuccess.toFixed(1)}%`} detail={`基于 ${agents.length} 个市场 Agent`} icon={TrendingUp} signal="lime" />
      </section>

      {activeMission ? <section className="mission-hero mesh-grid relative overflow-hidden rounded-[28px] border border-white/10 p-6 text-white shadow-card md:p-8">
        <div className="relative grid gap-8 xl:grid-cols-[0.78fr_1.22fr] xl:items-stretch">
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-cyan/25 bg-cyan/10 px-2 py-1 font-mono text-[10px] text-cyan">{activeMission.id}</span>
              <span className="inline-flex items-center gap-2 text-xs text-white/65"><span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(8,170,196,.8)]" />{activeStatus?.label}</span>
            </div>
            <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Active mission</p>
            <h2 className="mt-3 max-w-xl font-display text-2xl font-semibold leading-tight tracking-[-0.035em] md:text-[2rem]">{activeMission.title}</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/48">{activeMission.currentStage}</p>
            <Link className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-xl" to={activeRoute}>进入任务控制台 <ArrowRight size={16} /></Link>
            <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-8 font-mono text-[9px] text-white/35"><span>ESCROW · {formatPaymentAmount(activeMission.budget, activeMission.paymentMethod)}</span><span>DEADLINE · {activeMission.deadline}</span></div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">Live topology</p><p className="mt-1 text-sm font-semibold">工作流运行态</p></div>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] text-white/35"><span className="inline-flex items-center gap-1.5"><GitBranch size={12} />{stages.length} NODES</span><span>{edges.length} EDGES</span><span>{rootCount} ROOTS</span></div>
            </div>
            {previewStages.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {previewStages.map((stage, index) => (
                <article className="mission-stage-lane min-w-0" key={stage.id}>
                  <span className={`relative z-[1] flex size-14 items-center justify-center rounded-2xl border ${stage.status === 'done' ? 'border-lime/45 bg-lime/15 text-lime' : stage.status === 'running' ? 'border-cyan/45 bg-cyan/15 text-cyan' : 'border-white/15 bg-[#111820] text-white/35'}`}>
                    {stage.nodeType === 'approval' ? <ShieldCheck size={19} /> : stage.status === 'running' ? <Sparkles size={19} /> : <Clock3 size={19} />}
                  </span>
                  <p className="mt-4 font-mono text-[9px] text-white/30">{stage.nodeType === 'approval' ? 'GATE' : `TASK · ${index + 1}`}</p>
                  <h3 className="mt-1.5 line-clamp-2 text-xs font-semibold leading-5">{stage.name}</h3>
                  <p className="mt-2 text-[10px] text-white/35">{stage.status === 'done' ? '节点完成' : stage.nodeType === 'approval' && stage.status === 'running' ? '等待审批' : stage.status === 'running' ? 'Agent 执行中' : stage.status === 'failed' ? '等待处理' : '等待依赖'}</p>
                </article>
              ))}
            </div> : <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center text-xs text-white/40">工作流尚未确认；进入任务继续选择 Agent 和执行顺序。</div>}
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><span className="font-mono text-[9px] text-white/35">EVIDENCE STREAM</span><span className="font-mono text-xs font-semibold text-cyan">{evidenceCount} EVENTS</span></div>
          </div>
        </div>
      </section> : <section className="mesh-grid rounded-2xl border border-white/10 bg-ink px-6 py-14 text-center text-white"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10 text-cyan"><Sparkles size={21} /></span><h2 className="mt-5 text-xl font-semibold">真实工作区已准备好</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">当前账户还没有任务。创建第一个目标后，这里会显示实时阶段、证据事件和托管账本状态。</p><Link className="btn-signal mt-6" to="/missions/new"><Plus size={16} />发布第一个任务</Link></section>}

      <section className="yd-home-panel relative overflow-hidden rounded-[26px] border border-lime/45 p-5 shadow-card md:p-7">
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(460px,.92fr)] xl:items-center">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-ink/10 bg-white/55 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]"><Coins size={12} />{BRAND.contribution.eyebrow}</span><StatusBadge tone={ydLoading ? 'neutral' : ydOverview?.config.configured ? 'success' : 'warning'}>{ydLoading ? 'SYNCING' : ydOverview?.config.configured ? 'NETWORK READY' : 'TESTNET SETUP'}</StatusBadge></div>
            <h2 className="mt-5 max-w-xl font-display text-2xl font-bold leading-tight tracking-[-0.04em] md:text-3xl">任务完成不是终点，贡献会进入 {BRAND.contribution.shortName} 网络。</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-ink/60">已验收、已结算且无未决争议的贡献进入周期评分；领取 {BRAND.contribution.symbol} 后可主动锁仓生成治理 {BRAND.contribution.powerName}。任务支付与 {BRAND.contribution.symbol} 奖励始终独立。</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-medium text-ink/50"><span>任务结算</span><ArrowRight size={12} /><span>贡献积分</span><ArrowRight size={12} /><span>领取 {BRAND.contribution.symbol}</span><ArrowRight size={12} /><span>锁仓 {BRAND.contribution.powerName}</span></div>
            <Link className="btn-primary mt-6" to="/yd-finance">进入{BRAND.contribution.centerLabel} <ArrowRight size={15} /></Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              [Gift, ydLoading ? '—' : `${claimableYd} ${BRAND.contribution.symbol}`, '待领取奖励', '周期 Merkle Claim'],
              [LockKeyhole, ydLoading ? '—' : `${lockedYd} ${BRAND.contribution.symbol}`, '已锁定', ydOverview?.staking?.unlockTime ? `解锁 ${new Date(ydOverview.staking.unlockTime).toLocaleDateString('zh-CN')}` : '尚未锁仓'],
              [Vote, ydLoading ? '—' : governancePower, `治理 ${BRAND.contribution.powerName}`, ydOverview?.staking?.verified ? '认证账户' : '等待认证或锁仓'],
              [Sparkles, ydLoading ? '—' : String(activeProposals), '活跃提案', activeProposals ? '可查看快照与投票' : '暂无进行中提案'],
            ].map(([Icon, value, label, detailText]) => {
              const YdIcon = Icon as typeof Gift;
              return <article className="rounded-2xl border border-ink/10 bg-white/58 p-4 backdrop-blur-sm" key={String(label)}><div className="flex items-start justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-ink text-lime"><YdIcon size={16} /></span><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink/35">LIVE</span></div><p className="mt-5 truncate font-mono text-xl font-semibold tracking-tight text-ink">{String(value)}</p><p className="mt-1 text-xs font-semibold text-ink/70">{String(label)}</p><p className="mt-2 truncate text-[10px] text-ink/40">{String(detailText)}</p></article>;
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold">最近任务</h2>
              <p className="mt-1 text-xs text-muted">任务状态、团队与资金一目了然</p>
            </div>
            <Link to="/missions" className="text-xs font-semibold text-cyan">查看全部</Link>
          </div>
          <div className="divide-y divide-line">
            {missions.slice(0, 3).map((mission) => {
              const statusDisplay = missionStatusMeta(mission);
              return <Link to={routeForMission(mission)} className="grid gap-3 px-5 py-4 transition hover:bg-canvas/60 md:grid-cols-[1fr_auto_auto] md:items-center" key={mission.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{mission.title}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">{mission.id} · {mission.team.length} AGENTS</p>
                </div>
                <StatusBadge tone={statusDisplay.tone}>{statusDisplay.label}</StatusBadge>
                <span className="font-mono text-xs font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</span>
              </Link>;
            })}
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <Target size={18} />
            <h2 className="font-semibold">Trust Pulse</h2>
          </div>
          <div className="mt-5 space-y-5">
            {trustItems.map(([title, detailText, color]) => (
              <div className="flex gap-3" key={title}>
                <span className={`mt-1 size-2.5 shrink-0 rounded-full ${color === 'lime' ? 'bg-lime' : color === 'cyan' ? 'bg-cyan' : 'bg-line'}`} />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">{detailText}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
