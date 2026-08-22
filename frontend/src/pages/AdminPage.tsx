import { Activity, AlertTriangle, History, LoaderCircle, Search, ShieldCheck, UserCog, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { AdminAction, AdminUser, UserProfile } from '../types/domain';

const roleMeta: Record<UserProfile['role'], { label: string; className: string }> = {
  requester: { label: '任务方', className: 'bg-cyan/10 text-cyan' },
  developer: { label: '开发者', className: 'bg-lime/15 text-ink' },
  admin: { label: '管理员', className: 'bg-ink text-white' },
};

interface PendingRoleChange {
  user: AdminUser;
  role: UserProfile['role'];
}

function formatTime(value: string) {
  if (!value) return '尚无记录';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
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

  useEffect(() => {
    let cancelled = false;
    if (profile?.role !== 'admin') return () => { cancelled = true; };
    setLoading(true);
    setError('');
    void Promise.all([api.listAdminUsers(), api.listAdminActions()])
      .then(([nextUsers, nextActions]) => {
        if (cancelled) return;
        setUsers(nextUsers);
        setActions(nextActions);
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
  };
  const metrics: Array<{ icon: LucideIcon; value: number; label: string }> = [
    { icon: Users, value: counts.users, label: '工作区成员' },
    { icon: UserCog, value: counts.developers, label: 'Agent 开发者' },
    { icon: ShieldCheck, value: counts.admins, label: '平台管理员' },
  ];

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

  if (profile?.role !== 'admin') {
    return <div className="space-y-7"><PageHeader eyebrow="Platform Operations" title="平台运营" description="该工作区仅向平台管理员开放。所有角色变更均由 Worker 鉴权并写入审计轨迹。" /><section className="panel flex flex-col items-center px-6 py-16 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-warning/15 text-warning"><ShieldCheck size={24} /></span><h2 className="mt-5 text-xl font-semibold">需要管理员权限</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">当前账户没有平台运营权限。管理员角色只能由现有管理员在服务端授予，不能通过浏览器自行提升。</p><Link className="btn-secondary mt-6" to="/settings">查看当前身份</Link></section></div>;
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Platform Operations" title="平台运营" description="管理工作区成员与角色，查看关键权限变更。角色授权在服务端执行，并保留不可变审计记录。" actions={<span className="mono-chip">LIVE ADMIN</span>} />

      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map(({ icon: Icon, value, label }) => <article className="panel flex items-center gap-4 p-5" key={label}><span className="flex size-11 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon size={20} /></span><div><p className="font-mono text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div></article>)}
      </section>

      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,.75fr)]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">成员与权限</h2><p className="mt-1 text-xs text-muted">不能修改自己的管理员角色，系统始终保留至少一位管理员。</p></div><label className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="field h-10 pl-9" aria-label="搜索成员" placeholder="搜索姓名、邮箱或 ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          {loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步运营数据…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-canvas text-[10px] uppercase tracking-[0.12em] text-muted"><tr><th className="px-5 py-3 font-medium">成员</th><th className="px-5 py-3 font-medium">身份</th><th className="px-5 py-3 font-medium">最近更新</th><th className="px-5 py-3 text-right font-medium">角色</th></tr></thead><tbody className="divide-y divide-line">{filteredUsers.map((user) => <tr className="transition hover:bg-canvas/70" key={user.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-ink font-mono text-[10px] text-cyan">{user.displayName.slice(0, 2).toUpperCase()}</span><span><span className="block text-sm font-semibold">{user.displayName}</span><span className="mt-1 block font-mono text-[9px] text-muted">{user.id}</span></span></div></td><td className="px-5 py-4"><p className="text-xs font-medium">{user.email ?? '无邮箱账户'}</p><p className="mt-1 max-w-64 truncate font-mono text-[9px] text-muted">{user.walletAddress ?? 'No linked wallet'}</p></td><td className="px-5 py-4 text-xs text-muted">{formatTime(user.updatedAt || user.createdAt)}</td><td className="px-5 py-4 text-right">{user.id === profile?.id ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${roleMeta[user.role].className}`}>{roleMeta[user.role].label} · 当前账户</span> : <select className="field ml-auto h-9 w-28 py-1 text-xs" aria-label={`调整 ${user.displayName} 的角色`} value={user.role} onChange={(event) => { const role = event.target.value as UserProfile['role']; if (role !== user.role) setPending({ user, role }); }}><option value="requester">任务方</option><option value="developer">开发者</option><option value="admin">管理员</option></select>}</td></tr>)}{filteredUsers.length === 0 ? <tr><td colSpan={4} className="px-5 py-14 text-center text-sm text-muted">没有匹配的工作区成员</td></tr> : null}</tbody></table></div>}
        </section>

        <section className="panel self-start p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">权限审计</h2><p className="mt-1 text-xs text-muted">最近的管理员操作</p></div><History className="text-cyan" size={19} /></div><div className="mt-5 space-y-3">{actions.length ? actions.slice(0, 12).map((action) => <article className="rounded-xl border border-line bg-canvas p-4" key={action.id}><div className="flex items-center gap-2"><Activity className="text-cyan" size={14} /><p className="text-xs font-semibold">{userNames.get(action.actorId) ?? action.actorId}</p></div><p className="mt-2 text-xs leading-5 text-muted">将 <span className="font-semibold text-ink">{userNames.get(action.targetUserId) ?? action.targetUserId}</span> 从{roleMeta[action.detail.previousRole].label}调整为{roleMeta[action.detail.nextRole].label}</p><p className="mt-2 font-mono text-[9px] text-muted/70">{formatTime(action.createdAt)}</p></article>) : <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-xs text-muted">尚无角色变更记录</p>}</div></section>
      </div>

      <Modal open={Boolean(pending)} onClose={() => { if (!busy) setPending(null); }} title="确认角色调整" description="角色变更会立即影响该成员可访问的数据与操作，并写入平台审计轨迹。">
        {pending ? <div><div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4"><AlertTriangle className="mt-0.5 shrink-0 text-warning" size={17} /><p className="text-sm leading-6">将 <strong>{pending.user.displayName}</strong> 从“{roleMeta[pending.user.role].label}”调整为“{roleMeta[pending.role].label}”。</p></div><div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setPending(null)}>取消</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void confirmRoleChange()}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : null}{busy ? '写入中…' : '确认并写入审计'}</button></div></div> : null}
      </Modal>
    </div>
  );
}
