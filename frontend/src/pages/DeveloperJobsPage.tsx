import { BriefcaseBusiness, Check, Clock3, Download, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, paymentToken } from '../utils/payments';

export function DeveloperJobsPage() {
  const missions = useAppStore((state) => state.missions);
  const agents = useAppStore((state) => state.agents);
  const profile = useAppStore((state) => state.profile);
  const missionDetails = useAppStore((state) => state.missionDetails);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const respondStageOffer = useAppStore((state) => state.respondStageOffer);
  const [busyOfferId, setBusyOfferId] = useState('');
  const [error, setError] = useState('');
  const missingMissionIds = missions.filter((mission) => !missionDetails[mission.id]).map((mission) => mission.id);
  const ownedAgentIds = new Set(agents.filter((agent) => agent.ownerId === profile?.id).map((agent) => agent.id));
  const offers = missions.flatMap((mission) => {
    const detail = missionDetails[mission.id];
    return (detail?.offers ?? []).filter((offer) => ownedAgentIds.has(offer.agentId)).map((offer) => ({
      offer,
      mission,
      stage: detail.stages.find((stage) => stage.id === offer.stageId),
      agent: agents.find((agent) => agent.id === offer.agentId),
    }));
  });

  useEffect(() => {
    if (missingMissionIds.length === 0) return;
    void Promise.all(missingMissionIds.map((missionId) => loadMissionDetail(missionId))).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : '接单邀请加载失败。');
    });
  }, [loadMissionDetail, missionDetails, missions]);

  const respond = async (missionId: string, offerId: string, decision: 'accepted' | 'declined') => {
    setBusyOfferId(offerId);
    setError('');
    try {
      await respondStageOffer(missionId, offerId, decision);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '邀请响应失败。');
    } finally {
      setBusyOfferId('');
    }
  };
  const rows = missions.map((mission) => ({
    id: mission.id,
    agent: mission.team.map((agentId) => agents.find((agent) => agent.id === agentId)?.name ?? agentId).join(' / ') || '待分配',
    title: mission.title,
    status: mission.status === 'completed' ? '已结算' : mission.status === 'cancelled' ? '已退款终止' : mission.status === 'review' ? '待验收' : mission.status === 'running' ? '执行中' : '匹配中',
    reward: mission.budget,
    paymentMethod: mission.paymentMethod,
    progress: mission.progress,
    time: mission.createdAt,
  }));

  const exportCsv = () => {
    const lines = [['任务', 'Agent', '标题', '状态', '预算', '进度', '时间'], ...rows.map((row) => [row.id, row.agent, row.title, row.status, String(row.reward), String(row.progress), row.time])];
    const csv = lines.map((line) => line.map((cell) => `"${cell.split('"').join('""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agentmesh-jobs.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Developer / Jobs" title="接单记录" description="查看当前账户可访问任务的分发、执行、验收与结算状态。" actions={<button type="button" className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}><Download size={16} />导出 CSV</button>} />
      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {missingMissionIds.length > 0 && !error ? <section className="panel flex items-center justify-center gap-2 py-8 text-sm text-muted"><LoaderCircle size={17} className="animate-spin text-cyan" />正在同步阶段接单邀请…</section> : null}
      {missingMissionIds.length === 0 && offers.length === 0 ? <section className="panel py-10 text-center"><BriefcaseBusiness size={24} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold">暂无阶段邀请</p><p className="mt-1 text-xs text-muted">任务方发送工作流邀请后，可在这里接受或拒绝。</p></section> : null}
      {offers.length > 0 ? <section className="panel p-5 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">阶段接单邀请</h2><p className="mt-1 text-xs text-muted">每个阶段独立响应；任务方只有在全部 Agent 接受后才能托管启动。</p></div><StatusBadge tone={offers.some(({ offer }) => offer.status === 'pending') ? 'warning' : 'success'}>{offers.filter(({ offer }) => offer.status === 'pending').length} 个待响应</StatusBadge></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{offers.map(({ offer, mission, stage, agent }) => <article className="rounded-xl border border-line bg-canvas/40 p-4" key={offer.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] text-muted">{mission.id} · {stage?.id ?? offer.stageId}</p><h3 className="mt-1 text-sm font-semibold">{mission.title} / {stage?.name ?? '阶段邀请'}</h3><p className="mt-2 text-xs text-muted">{agent?.name ?? offer.agentId} · 阶段预算 {stage ? formatPaymentAmount(stage.budget, mission.paymentMethod) : '—'}</p></div><StatusBadge tone={offer.status === 'accepted' ? 'success' : offer.status === 'pending' ? 'warning' : 'danger'}>{offer.status === 'accepted' ? '已接受' : offer.status === 'pending' ? '待响应' : offer.status === 'declined' ? '已拒绝' : '已过期'}</StatusBadge></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock3 size={13} />截止 {new Date(offer.expiresAt).toLocaleString('zh-CN', { hour12: false })}</span>{offer.status === 'pending' ? <div className="flex gap-2"><button type="button" className="btn-secondary !px-3 !py-2 text-danger" onClick={() => void respond(mission.id, offer.id, 'declined')} disabled={Boolean(busyOfferId)}><X size={14} />拒绝</button><button type="button" className="btn-primary !px-3 !py-2" onClick={() => void respond(mission.id, offer.id, 'accepted')} disabled={Boolean(busyOfferId)}>{busyOfferId === offer.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}接受</button></div> : null}</div>
        </article>)}</div>
      </section> : null}
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-line bg-canvas/55 text-[10px] uppercase tracking-[0.1em] text-muted"><tr>{['任务','Agent','状态','预算','进度','时间',''].map((item) => <th className="px-5 py-3 font-semibold" key={item}>{item}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((row) => <tr className="hover:bg-canvas/40" key={row.id}><td className="px-5 py-4"><p className="font-mono text-[10px] text-muted">{row.id}</p><p className="mt-1 font-semibold">{row.title}</p></td><td className="px-5 py-4">{row.agent}</td><td className="px-5 py-4"><StatusBadge tone={row.status === '已结算' ? 'success' : row.status === '匹配中' ? 'warning' : 'info'}>{row.status}</StatusBadge></td><td className="px-5 py-4 font-mono font-semibold">{formatPaymentAmount(row.reward, row.paymentMethod)} {paymentToken(row.paymentMethod)}</td><td className="px-5 py-4 font-mono text-xs">{row.progress}%</td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted">{row.time}</td><td className="px-5 py-4"><a href={`#/missions/${row.id}/execution`} className="inline-flex rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" aria-label={`查看 ${row.id}`}><ExternalLink size={16} /></a></td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-xs text-muted"><BriefcaseBusiness size={14} />共 {rows.length} 条记录</div>
      </section>
    </div>
  );
}
