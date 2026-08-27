import { Activity, AlertTriangle, Bot, History, LoaderCircle, RefreshCw, Search, ShieldCheck, UserCog, Users, Vote, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { AdminAction, AdminAgentQualityRow, AdminUser, AgentQualityStats, UserProfile } from '../types/domain';

const roleMeta: Record<UserProfile['role'], { label: string; className: string }> = {
  requester: { label: '任务方', className: 'bg-cyan/10 text-cyan' },
  developer: { label: '开发者', className: 'bg-lime/15 text-ink' },
  admin: { label: '管理员', className: 'bg-ink text-white' },
};

interface PendingRoleChange {
  user: AdminUser;
  role: UserProfile['role'];
}

interface PendingQualityEvent {
  agentId: string;
  agentName: string;
  type: 'security_incident' | 'security_resolved';
}

function formatTime(value: string) {
  if (!value) return '尚无记录';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function withQualityStats(row: AdminAgentQualityRow, stats: AgentQualityStats): AdminAgentQualityRow {
  const gateMode = row.agent.quality?.gateMode ?? 'shadow';
  const wouldBeEligible = stats.marketplaceStatus === 'listed' && stats.eligibilityReasons.length === 0;
  return {
    ...row,
    agent: {
      ...row.agent,
      quality: {
        ...stats,
        gateMode,
        wouldBeEligible,
        eligible: gateMode === 'shadow' ? row.agent.status === 'active' : wouldBeEligible,
      },
    },
    reasons: stats.eligibilityReasons,
  };
}

export function AdminPage() {
  const { profile } = useAuth();
  const showToast = useAppStore((state) => state.showToast);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingRoleChange | null>(null);
  const [committeeBusyId, setCommitteeBusyId] = useState('');
  const [powerDrafts, setPowerDrafts] = useState<Record<string, number>>({});
  const [qualityRows, setQualityRows] = useState<AdminAgentQualityRow[]>([]);
  const [qualityBusyId, setQualityBusyId] = useState('');
  const [qualityEvent, setQualityEvent] = useState<PendingQualityEvent | null>(null);
  const [qualityReason, setQualityReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (profile?.role !== 'admin') return () => { cancelled = true; };
    setLoading(true);
    setError('');
    void Promise.all([api.listAdminUsers(), api.listAdminActions(), api.listAdminAgentQuality()])
      .then(([nextUsers, nextActions, nextQualityRows]) => {
        if (cancelled) return;
        setUsers(nextUsers);
        setPowerDrafts(Object.fromEntries(nextUsers.map((user) => [user.id, user.arbitration?.power ?? 1])));
        setActions(nextActions);
        setQualityRows(nextQualityRows);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : '运营数据加载失败。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.role]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return users;
    return users.filter((user) => `${user.id} ${user.displayName} ${user.email ?? ''} ${user.walletAddress ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [query, users]);

  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.displayName])), [users]);
  const counts = {
    users: users.length,
    developers: users.filter((user) => user.role === 'developer').length,
    admins: users.filter((user) => user.role === 'admin').length,
    arbitrators: users.filter((user) => user.arbitration?.status === 'active').length,
  };
  const metrics: Array<{ icon: LucideIcon; value: number; label: string }> = [
    { icon: Users, value: counts.users, label: '工作区成员' },
    { icon: UserCog, value: counts.developers, label: 'Agent 开发者' },
    { icon: ShieldCheck, value: counts.admins, label: '平台管理员' },
    { icon: Vote, value: counts.arbitrators, label: '活跃仲裁委员' },
  ];

  const toggleArbitrator = async (user: AdminUser) => {
    const active = user.arbitration?.status !== 'active';
    setCommitteeBusyId(user.id);
    setError('');
    try {
      const member = await api.setArbitrationMember(user.id, active);
      setUsers((current) => current.map((item) => item.id === user.id ? {
        ...item,
        arbitration: { status: member.status, power: member.power },
      } : item));
      showToast(`${user.displayName} 已${active ? '加入' : '退出'}仲裁委员会。`, 'success');
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : '仲裁委员状态更新失败。');
    } finally {
      setCommitteeBusyId('');
    }
  };

  const updateArbitratorPower = async (user: AdminUser) => {
    if (user.arbitration?.status !== 'active') return;
    const power = Math.max(1, Math.min(1_000_000, Math.floor(powerDrafts[user.id] ?? user.arbitration.power)));
    setCommitteeBusyId(user.id);
    setError('');
    try {
      const member = await api.setArbitrationMember(user.id, true, power);
      setUsers((current) => current.map((item) => item.id === user.id ? {
        ...item, arbitration: { status: member.status, power: member.power },
      } : item));
      setPowerDrafts((current) => ({ ...current, [user.id]: member.power }));
      showToast(`${user.displayName} 的仲裁 Power 已更新；既有提案快照不受影响。`, 'success');
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : '仲裁 Power 更新失败。');
    } finally {
      setCommitteeBusyId('');
    }
  };

  const confirmRoleChange = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.updateAdminUserRole(pending.user.id, pending.role);
      setUsers((current) => current.map((user) => user.id === result.profile.id ? result.profile : user));
      if (result.action) setActions((current) => [result.action!, ...current]);
      showToast(`${pending.user.displayName} 已调整为${roleMeta[pending.role].label}。`, 'success');
      setPending(null);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '角色调整失败。');
    } finally {
      setBusy(false);
    }
  };

  const recomputeQuality = async (agentId: string) => {
    setQualityBusyId(agentId); setError('');
    try {
      const stats = await api.recomputeAgentQuality(agentId);
      setQualityRows((current) => current.map((row) => row.agent.id === agentId ? withQualityStats(row, stats) : row));
      showToast('Agent 质量分已按完整事件历史重新计算。', 'success');
    } catch (qualityError) {
      setError(qualityError instanceof Error ? qualityError.message : '质量分重算失败。');
    } finally { setQualityBusyId(''); }
  };

  const submitQualityEvent = async () => {
    if (!qualityEvent || qualityReason.trim().length < 12) return;
    setQualityBusyId(qualityEvent.agentId); setError('');
    try {
      const result = await api.recordAdminAgentQualityEvent(qualityEvent.agentId, {
        type: qualityEvent.type,
        reason: qualityReason.trim(),
        ...(qualityEvent.type === 'security_incident' ? { severe: true } : {}),
      });
      if (result.stats) {
        const stats = result.stats;
        setQualityRows((current) => current.map((row) => row.agent.id === qualityEvent.agentId ? withQualityStats(row, stats) : row));
      }
      showToast(qualityEvent.type === 'security_incident' ? '严重风险事件已记录，Agent 已进入暂停判定。' : '风险解除事件已写入，恢复仍需满足连续履约条件。', 'success');
      setQualityEvent(null); setQualityReason('');
    } catch (qualityActionError) {
      setError(qualityActionError instanceof Error ? qualityActionError.message : '质量事件写入失败。');
    } finally { setQualityBusyId(''); }
  };

  if (profile?.role !== 'admin') {
    return <div className="space-y-7"><PageHeader eyebrow="Platform Operations" title="平台运营" description="该工作区仅向平台管理员开放。所有角色变更均由 Worker 鉴权并写入审计轨迹。" /><section className="panel flex flex-col items-center px-6 py-16 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-warning/15 text-warning"><ShieldCheck size={24} /></span><h2 className="mt-5 text-xl font-semibold">需要管理员权限</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">当前账户没有平台运营权限。管理员角色只能由现有管理员在服务端授予，不能通过浏览器自行提升。</p><Link className="btn-secondary mt-6" to="/settings">查看当前身份</Link></section></div>;
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Platform Operations" title="平台运营" description="管理工作区成员与角色，查看关键权限变更。角色授权在服务端执行，并保留不可变审计记录。" actions={<span className="mono-chip">LIVE ADMIN</span>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ icon: Icon, value, label }) => <article className="panel flex items-center gap-4 p-5" key={label}><span className="flex size-11 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon size={20} /></span><div><p className="font-mono text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div></article>)}
      </section>

      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}

      <section className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Bot size={18} /></span><div><h2 className="font-semibold">Agent 市场质量</h2><p className="mt-1 text-xs text-muted">正式 Trial、Endpoint、已结算履约、交付与争议共同形成可重算信誉；shadow 不会直接下架现有 Agent。</p></div></div><span className="mono-chip">{qualityRows.filter((row) => row.agent.quality?.wouldBeEligible).length} READY / {qualityRows.length}</span></div><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{qualityRows.map(({ agent, reasons }) => <article className="rounded-2xl border border-line bg-canvas/30 p-4" key={agent.id}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{agent.name}</p><p className="mt-1 font-mono text-[9px] text-muted">{agent.id}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${agent.quality?.marketplaceStatus === 'listed' ? 'bg-lime/20 text-ink' : agent.quality?.marketplaceStatus === 'suspended' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>{agent.quality?.marketplaceStatus ?? 'unrated'}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div><p className="text-[9px] text-muted">信誉</p><p className="mt-1 font-mono text-lg font-semibold">{agent.quality?.reputation ?? '—'}</p></div><div><p className="text-[9px] text-muted">置信度</p><p className="mt-1 font-mono text-xs font-semibold">{agent.quality?.confidence?.toUpperCase() ?? '—'}</p></div><div><p className="text-[9px] text-muted">Endpoint</p><p className="mt-1 font-mono text-xs font-semibold">{agent.quality?.endpointHealthy ? 'OK' : 'CHECK'}</p></div></div><p className="mt-3 line-clamp-2 min-h-10 text-[10px] leading-5 text-muted">{reasons.length ? reasons.join(' · ') : '满足强制市场准入条件'}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" className="btn-secondary" disabled={Boolean(qualityBusyId)} onClick={() => void recomputeQuality(agent.id)}>{qualityBusyId === agent.id ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}重算</button><button type="button" className={agent.quality?.unresolvedSevereRisks ? 'btn-secondary' : 'inline-flex min-h-10 items-center justify-center rounded-xl border border-danger/25 px-3 text-xs font-semibold text-danger transition hover:bg-danger/5'} disabled={Boolean(qualityBusyId)} onClick={() => { setQualityReason(''); setQualityEvent({ agentId: agent.id, agentName: agent.name, type: agent.quality?.unresolvedSevereRisks ? 'security_resolved' : 'security_incident' }); }}>{agent.quality?.unresolvedSevereRisks ? '解除风险' : '记录风险'}</button></div></article>)}</div></section>

      <section className="panel p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">委员 Power</h2><p className="mt-1 text-xs text-muted">Power 为正整数，只影响之后创建的加权提案；已有快照不会重算。</p></div><span className="mono-chip">INTEGER · SNAPSHOT</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{users.filter((user) => user.arbitration?.status === 'active').map((user) => <div className="flex items-center gap-2 rounded-xl bg-canvas p-3" key={user.id}><span className="min-w-0 flex-1 truncate text-xs font-semibold">{user.displayName}</span><input className="field h-9 w-24 py-1 text-xs" type="number" min={1} max={1_000_000} step={1} aria-label={`调整 ${user.displayName} 的仲裁 Power`} value={powerDrafts[user.id] ?? user.arbitration?.power ?? 1} onChange={(event) => setPowerDrafts((current) => ({ ...current, [user.id]: Number(event.target.value) }))} /><button type="button" className="btn-secondary min-h-9 px-2 text-xs" disabled={Boolean(committeeBusyId) || powerDrafts[user.id] === user.arbitration?.power} onClick={() => void updateArbitratorPower(user)}>保存</button></div>)}</div></section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,.75fr)]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">成员与治理权限</h2><p className="mt-1 text-xs text-muted">仲裁委员身份独立于平台角色；Power 为正整数，只有新建提案会读取最新值。</p></div><label className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="field h-10 pl-9" aria-label="搜索成员" placeholder="搜索姓名、邮箱或 ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          {loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步运营数据…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-canvas text-[10px] uppercase tracking-[0.12em] text-muted"><tr><th className="px-5 py-3 font-medium">成员</th><th className="px-5 py-3 font-medium">身份</th><th className="px-5 py-3 font-medium">仲裁委员会</th><th className="px-5 py-3 font-medium">最近更新</th><th className="px-5 py-3 text-right font-medium">角色</th></tr></thead><tbody className="divide-y divide-line">{filteredUsers.map((user) => <tr className="transition hover:bg-canvas/70" key={user.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-ink font-mono text-[10px] text-cyan">{user.displayName.slice(0, 2).toUpperCase()}</span><span><span className="block text-sm font-semibold">{user.displayName}</span><span className="mt-1 block font-mono text-[9px] text-muted">{user.id}</span></span></div></td><td className="px-5 py-4"><p className="text-xs font-medium">{user.email ?? '无邮箱账户'}</p><p className="mt-1 max-w-64 truncate font-mono text-[9px] text-muted">{user.walletAddress ?? 'No linked wallet'}</p></td><td className="px-5 py-4"><button type="button" className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${user.arbitration?.status === 'active' ? 'border-cyan/30 bg-cyan/10 text-cyan' : 'border-line bg-white text-muted'}`} disabled={Boolean(committeeBusyId)} onClick={() => void toggleArbitrator(user)}>{committeeBusyId === user.id ? <LoaderCircle className="animate-spin" size={13} /> : <span className={`size-2 rounded-full ${user.arbitration?.status === 'active' ? 'bg-cyan' : 'bg-muted/35'}`} />}{user.arbitration?.status === 'active' ? `委员 · Power ${user.arbitration.power}` : '任命为委员'}</button></td><td className="px-5 py-4 text-xs text-muted">{formatTime(user.updatedAt || user.createdAt)}</td><td className="px-5 py-4 text-right">{user.id === profile?.id ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${roleMeta[user.role].className}`}>{roleMeta[user.role].label} · 当前账户</span> : <select className="field ml-auto h-9 w-28 py-1 text-xs" aria-label={`调整 ${user.displayName} 的角色`} value={user.role} onChange={(event) => { const role = event.target.value as UserProfile['role']; if (role !== user.role) setPending({ user, role }); }}><option value="requester">任务方</option><option value="developer">开发者</option><option value="admin">管理员</option></select>}</td></tr>)}{filteredUsers.length === 0 ? <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-muted">没有匹配的工作区成员</td></tr> : null}</tbody></table></div>}
        </section>

        <section className="panel self-start p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">权限审计</h2><p className="mt-1 text-xs text-muted">最近的管理员操作</p></div><History className="text-cyan" size={19} /></div><div className="mt-5 space-y-3">{actions.length ? actions.slice(0, 12).map((action) => <article className="rounded-xl border border-line bg-canvas p-4" key={action.id}><div className="flex items-center gap-2"><Activity className="text-cyan" size={14} /><p className="text-xs font-semibold">{userNames.get(action.actorId) ?? action.actorId}</p></div><p className="mt-2 text-xs leading-5 text-muted">将 <span className="font-semibold text-ink">{userNames.get(action.targetUserId) ?? action.targetUserId}</span> 从{roleMeta[action.detail.previousRole].label}调整为{roleMeta[action.detail.nextRole].label}</p><p className="mt-2 font-mono text-[9px] text-muted/70">{formatTime(action.createdAt)}</p></article>) : <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-xs text-muted">尚无角色变更记录</p>}</div></section>
      </div>

      <Modal open={Boolean(pending)} onClose={() => { if (!busy) setPending(null); }} title="确认角色调整" description="角色变更会立即影响该成员可访问的数据与操作，并写入平台审计轨迹。">
        {pending ? <div><div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4"><AlertTriangle className="mt-0.5 shrink-0 text-warning" size={17} /><p className="text-sm leading-6">将 <strong>{pending.user.displayName}</strong> 从“{roleMeta[pending.user.role].label}”调整为“{roleMeta[pending.role].label}”。</p></div><div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setPending(null)}>取消</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void confirmRoleChange()}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : null}{busy ? '写入中…' : '确认并写入审计'}</button></div></div> : null}
      </Modal>

      <Modal open={Boolean(qualityEvent)} onClose={() => { if (!qualityBusyId) { setQualityEvent(null); setQualityReason(''); } }} title={qualityEvent?.type === 'security_incident' ? '记录严重风险' : '解除风险标记'} description="操作不会直接改写信誉分，只会向不可变质量账本追加带原因的审计事件。">
        {qualityEvent ? <div><div className={`flex items-start gap-3 rounded-xl border p-4 ${qualityEvent.type === 'security_incident' ? 'border-danger/25 bg-danger/10' : 'border-cyan/25 bg-cyan/10'}`}><AlertTriangle className={`mt-0.5 shrink-0 ${qualityEvent.type === 'security_incident' ? 'text-danger' : 'text-cyan'}`} size={17} /><p className="text-sm leading-6"><strong>{qualityEvent.agentName}</strong>：{qualityEvent.type === 'security_incident' ? '提交后将立即进入 suspended 判定并停止新接单。' : '解除严重风险后仍需满足分数、Endpoint 和最近 3 单连续成功的恢复条件。'}</p></div><label className="mt-5 block text-xs font-semibold">操作原因<textarea className="field mt-2 min-h-28 resize-y py-3" maxLength={2000} placeholder="至少 12 个字符，说明证据来源和处理依据" value={qualityReason} onChange={(event) => setQualityReason(event.target.value)} /></label><div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={Boolean(qualityBusyId)} onClick={() => { setQualityEvent(null); setQualityReason(''); }}>取消</button><button type="button" className={qualityEvent.type === 'security_incident' ? 'btn-primary bg-danger hover:bg-danger/90' : 'btn-primary'} disabled={Boolean(qualityBusyId) || qualityReason.trim().length < 12} onClick={() => void submitQualityEvent()}>{qualityBusyId ? <LoaderCircle className="animate-spin" size={15} /> : null}{qualityBusyId ? '写入中…' : '确认写入质量账本'}</button></div></div> : null}
      </Modal>
    </div>
  );
}
