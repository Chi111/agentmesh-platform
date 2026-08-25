import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Compass,
  Gauge,
  Info,
  ListTodo,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Settings,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AuthDialog } from '../../auth/AuthDialog';
import { useAuth } from '../../auth/AuthProvider';
import { useAppStore } from '../../store/useAppStore';
import type { UserRole } from '../../types/domain';
import { routeForMission } from '../../utils/missionState';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const requesterNav: NavItem[] = [
  { label: '工作台', to: '/dashboard', icon: Gauge },
  { label: '发布任务', to: '/missions/new', icon: Plus },
  { label: '我的任务', to: '/missions', icon: ListTodo },
  { label: '测试充值', to: '/wallet/test-funds', icon: WalletCards },
  { label: 'Agent 市场', to: '/agents', icon: Compass },
  { label: '仲裁中心', to: '/arbitration', icon: Scale },
];

const developerNav: NavItem[] = [
  { label: '开发者概览', to: '/developer', icon: Activity },
  { label: '我的 Agent', to: '/developer/agents', icon: Bot },
  { label: '注册 Agent', to: '/developer/agents/new', icon: Plus },
  { label: '接单记录', to: '/developer/jobs', icon: BriefcaseBusiness },
  { label: '收益中心', to: '/developer/earnings', icon: CircleDollarSign },
  { label: '仲裁中心', to: '/arbitration', icon: Scale },
];

function isSidebarItemActive(pathname: string, role: UserRole, to: string) {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (normalizedPathname === to) return true;
  if (role === 'requester' && to === '/missions') return normalizedPathname.startsWith('/missions/') && normalizedPathname !== '/missions/new';
  if (role === 'requester' && to === '/agents') return normalizedPathname.startsWith('/agents/');
  if (role === 'developer' && to === '/developer/jobs') return normalizedPathname.startsWith('/missions/');
  return false;
}

function MeshMark() {
  return (
    <span className="relative flex size-9 items-center justify-center rounded-xl border border-cyan/35 bg-white/5" aria-hidden="true">
      <span className="absolute left-2 top-4 size-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(0,184,217,.8)]" />
      <span className="absolute right-2 top-2 size-1.5 rounded-full bg-lime" />
      <span className="absolute bottom-2 right-2 size-1.5 rounded-full bg-cyan" />
      <span className="h-px w-4 -rotate-[28deg] bg-cyan/70" />
      <span className="absolute h-px w-4 rotate-[28deg] bg-cyan/70" />
    </span>
  );
}

function Sidebar({
  open,
  interactive,
  sidebarRef,
  onClose,
  onOpenAuth,
}: {
  open: boolean;
  interactive: boolean;
  sidebarRef: RefObject<HTMLElement>;
  onClose: () => void;
  onOpenAuth: () => void;
}) {
  const storedRole = useAppStore((state) => state.role);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const setRole = useAppStore((state) => state.setRole);
  const { profile, status, signOut, linkedWalletAddress, walletAddress, provider } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = location.pathname.startsWith('/developer') ? 'developer' : storedRole;
  const identityWallet = walletAddress ?? linkedWalletAddress;
  const items = role === 'requester' ? requesterNav : developerNav;
  const label = role === 'requester' ? '任务方门户' : '开发者控制台';
  const switchRole = async (nextRole: UserRole) => {
    await setRole(nextRole);
    onClose();
    navigate(nextRole === 'requester' ? '/dashboard' : '/developer');
  };

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    if (interactive) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
  }, [interactive, sidebarRef]);

  return (
    <>
      {open ? <button type="button" aria-label="关闭菜单" className="fixed inset-0 z-40 bg-ink/45 lg:hidden" onClick={onClose} /> : null}
      <aside
        id="app-sidebar"
        ref={sidebarRef}
        aria-hidden={interactive ? undefined : true}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh min-h-0 w-[264px] shrink-0 flex-col overflow-hidden bg-ink px-4 py-5 text-white transition-transform duration-200 [@media(max-height:520px)]:py-3 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link to="/contract" className="flex items-center gap-3" onClick={onClose} aria-label="查看 AgentMesh 合约公开信息" title="合约公开信息">
            <MeshMark />
            <span>
              <strong className="block text-[15px] tracking-tight">AgentMesh</strong>
              <small className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">Orchestration Network</small>
            </span>
          </Link>
          <button type="button" className="rounded-lg p-2 text-white/55 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="关闭菜单">
            <X size={18} />
          </button>
        </div>

        <div className="mx-2 mt-7 rounded-xl border border-white/10 bg-white/[0.04] p-3 [@media(max-height:620px)]:hidden">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-lime shadow-[0_0_10px_rgba(183,243,74,.65)]" />
            <span className="text-xs font-semibold">{label}</span>
          </div>
          <p className="mt-2 flex items-center gap-2 font-mono text-[9px] leading-4 text-white/35">
            {syncStatus === 'loading' ? <LoaderCircle size={11} className="animate-spin" /> : <span className={`size-1.5 rounded-full ${syncStatus === 'error' ? 'bg-warning' : 'bg-cyan'}`} />}
            {profile ? 'LIVE WORKSPACE · D1 SYNC' : 'PUBLIC DIRECTORY · READ ONLY'}
          </p>
        </div>

        <div className="mx-2 mt-3 grid grid-cols-2 rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:hidden" role="group" aria-label="角色切换">
          <button type="button" aria-pressed={role === 'requester'} className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${role === 'requester' ? 'bg-white text-ink' : 'text-white/50 hover:text-white'}`} onClick={() => void switchRole('requester')}>任务方</button>
          <button type="button" aria-pressed={role === 'developer'} className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${role === 'developer' ? 'bg-white text-ink' : 'text-white/50 hover:text-white'}`} onClick={() => void switchRole('developer')}>开发者</button>
        </div>

        <nav className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin] [@media(max-height:620px)]:mt-3" aria-label={label}>
          <p className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">Workspace</p>
          {items.map(({ label: itemLabel, to, icon: Icon }) => {
            const isActive = isSidebarItemActive(location.pathname, role, to);
            return <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              onClick={onClose}
              className={`group relative flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm transition-colors ${isActive ? 'bg-white/[0.07] text-white before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-cyan' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}
            >
              <Icon size={18} className={isActive ? 'text-cyan' : undefined} aria-hidden="true" />
              <span className={isActive ? 'font-semibold' : 'font-medium'}>{itemLabel}</span>
              {isActive ? <span className="ml-auto size-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(183,243,74,.55)]" aria-hidden="true" /> : null}
            </Link>;
          })}
          {profile?.role === 'admin' ? <NavLink
            to="/admin"
            onClick={onClose}
            className={({ isActive }: { isActive: boolean }) => `group relative flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm transition-colors ${isActive ? 'bg-white/[0.07] text-white before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-lime' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}
          >
            {({ isActive }: { isActive: boolean }) => <>
              <ShieldCheck size={18} className={isActive ? 'text-lime' : undefined} aria-hidden="true" />
              <span className={isActive ? 'font-semibold' : 'font-medium'}>平台运营</span>
              {isActive ? <span className="ml-auto size-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(183,243,74,.55)]" aria-hidden="true" /> : null}
            </>}
          </NavLink> : null}
        </nav>

        <div className="shrink-0 bg-ink pt-2">
          <NavLink to="/settings" onClick={onClose} className={({ isActive }: { isActive: boolean }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/[0.05] hover:text-white'}`}>
            <Settings size={18} />
            设置
          </NavLink>

          <div className="mx-2 mt-3 border-t border-white/10 pt-3">
            <button type="button" className="flex w-full items-center gap-3 rounded-xl p-1 text-left transition hover:bg-white/[0.05]" onClick={profile ? () => void signOut() : onOpenAuth}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan/15 font-mono text-xs text-cyan">{profile ? profile.displayName.slice(0, 2).toUpperCase() : <LogIn size={16} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{profile?.displayName ?? (status === 'loading' ? '正在恢复会话…' : '连接真实工作区')}</span>
                <span className="block truncate text-[10px] text-white/35 [@media(max-height:420px)]:hidden">
                  {profile?.email ?? (identityWallet ? `${identityWallet.slice(0, 6)}…${identityWallet.slice(-4)}` : provider === 'privy' ? 'Web2 / Web3 identity' : '尚未登录')}
                </span>
              </span>
              {profile ? <LogOut size={14} className="text-white/30" /> : null}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  mobileMenuOpen,
  menuButtonRef,
  onOpenMenu,
}: {
  mobileMenuOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement>;
  onOpenMenu: () => void;
}) {
  const { profile, provider, linkedWalletAddress, walletAddress, linkWallet } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const storedRole = useAppStore((state) => state.role);
  const role = location.pathname.startsWith('/developer') ? 'developer' : storedRole;
  const setRole = useAppStore((state) => state.setRole);
  const notifications = useAppStore((state) => state.notifications);
  const missions = useAppStore((state) => state.missions);
  const agents = useAppStore((state) => state.agents);
  const markNotificationsRead = useAppStore((state) => state.markNotificationsRead);
  const [panel, setPanel] = useState<'notifications' | 'wallet' | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const panelRegionRef = useRef<HTMLDivElement>(null);
  const searchCloseTimerRef = useRef<number | null>(null);
  const unread = notifications.filter((item) => item.unread).length;
  const identityWallet = walletAddress ?? linkedWalletAddress;
  const shortWallet = identityWallet ? `${identityWallet.slice(0, 6)}…${identityWallet.slice(-4)}` : null;
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length < 2) return [];
    const missionResults = missions
      .filter((mission) => `${mission.id} ${mission.title} ${mission.tags.join(' ')}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 4)
      .map((mission) => ({
        id: mission.id,
        label: mission.title,
        meta: `任务 · ${mission.id}`,
        to: routeForMission(mission),
      }));
    const agentResults = agents
      .filter((agent) => `${agent.id} ${agent.name} ${agent.category} ${agent.tags.join(' ')}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 4)
      .map((agent) => ({ id: agent.id, label: agent.name, meta: `Agent · ${agent.category}`, to: `/agents/${agent.id}` }));
    return [...missionResults, ...agentResults].slice(0, 6);
  }, [agents, missions, query]);

  useEffect(() => {
    if (!panel) return undefined;
    const closePanel = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') setPanel(null);
      if (event instanceof PointerEvent && panelRegionRef.current && !panelRegionRef.current.contains(event.target as Node)) setPanel(null);
    };
    window.addEventListener('keydown', closePanel);
    document.addEventListener('pointerdown', closePanel);
    return () => {
      window.removeEventListener('keydown', closePanel);
      document.removeEventListener('pointerdown', closePanel);
    };
  }, [panel]);

  useEffect(() => {
    if (searchCloseTimerRef.current !== null) {
      window.clearTimeout(searchCloseTimerRef.current);
      searchCloseTimerRef.current = null;
    }
    setPanel(null);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => () => {
    if (searchCloseTimerRef.current !== null) window.clearTimeout(searchCloseTimerRef.current);
  }, []);

  const cancelSearchClose = () => {
    if (searchCloseTimerRef.current === null) return;
    window.clearTimeout(searchCloseTimerRef.current);
    searchCloseTimerRef.current = null;
  };

  const scheduleSearchClose = () => {
    cancelSearchClose();
    searchCloseTimerRef.current = window.setTimeout(() => {
      setSearchOpen(false);
      searchCloseTimerRef.current = null;
    }, 120);
  };

  const openResult = (to: string) => {
    cancelSearchClose();
    setQuery('');
    setSearchOpen(false);
    navigate(to);
  };

  const switchRole = async (nextRole: UserRole) => {
    await setRole(nextRole);
    setPanel(null);
    navigate(nextRole === 'requester' ? '/dashboard' : '/developer');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-line bg-white/90 px-4 backdrop-blur-xl md:px-7">
      <button ref={menuButtonRef} type="button" className="mr-3 rounded-lg p-2 text-muted hover:bg-canvas lg:hidden" onClick={onOpenMenu} aria-label="打开菜单" aria-controls="app-sidebar" aria-expanded={mobileMenuOpen}>
        <Menu size={20} />
      </button>

      <div className="relative hidden w-full max-w-sm md:block">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="field h-10 rounded-full bg-canvas pl-10"
          aria-label="全局搜索"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-expanded={searchOpen && query.trim().length >= 2}
          placeholder="搜索任务或 Agent…"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
          onFocus={() => { cancelSearchClose(); setSearchOpen(true); }}
          onBlur={scheduleSearchClose}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { cancelSearchClose(); setSearchOpen(false); event.currentTarget.blur(); }
            if (event.key === 'Enter' && searchResults[0]) openResult(searchResults[0].to);
          }}
        />
        {searchOpen && query.trim().length >= 2 ? <div id="global-search-results" className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-float">
          {searchResults.length ? searchResults.map((result) => <button type="button" className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-canvas" onMouseDown={(event) => event.preventDefault()} onClick={() => openResult(result.to)} key={`${result.meta}-${result.id}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{result.label}</span><span className="mt-1 block font-mono text-[9px] text-muted">{result.meta}</span></span><Search size={14} className="shrink-0 text-muted" /></button>) : <p className="px-3 py-5 text-center text-xs text-muted">没有匹配的任务或 Agent</p>}
        </div> : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden rounded-xl border border-line bg-canvas p-1 sm:flex" role="group" aria-label="角色切换">
          <button type="button" aria-pressed={role === 'requester'} onClick={() => void switchRole('requester')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${role === 'requester' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            任务方
          </button>
          <button type="button" aria-pressed={role === 'developer'} onClick={() => void switchRole('developer')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${role === 'developer' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            开发者
          </button>
        </div>

        <div ref={panelRegionRef} className="flex items-center gap-2">
          <div className="relative">
          <button type="button" className={`relative rounded-xl border p-2.5 transition ${panel === 'notifications' ? 'border-cyan/35 bg-cyan/10 text-ink' : 'border-line bg-white text-muted hover:bg-canvas hover:text-ink'}`} onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')} aria-label={`通知，${unread} 条未读`} aria-expanded={panel === 'notifications'}>
            <Bell size={18} />
            {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-cyan ring-2 ring-white" /> : null}
          </button>
          {panel === 'notifications' ? (
            <div className="absolute right-0 top-12 flex max-h-[calc(100dvh-5rem)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white p-3 shadow-float">
              <div className="flex shrink-0 items-center justify-between px-2 py-1">
                <p className="text-sm font-semibold">通知中心</p>
                <button type="button" className="text-xs font-medium text-cyan" onClick={() => void markNotificationsRead()}>全部已读</button>
              </div>
              <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
                {notifications.map((item) => (
                  <div className={`rounded-xl p-3 ${item.unread ? 'bg-cyan/[0.07]' : 'bg-white'}`} key={item.id}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.tone === 'success' ? 'bg-lime' : item.tone === 'warning' ? 'bg-warning' : 'bg-cyan'}`} />
                      <div>
                        <p className="text-xs font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                        <p className="mt-1.5 font-mono text-[9px] text-muted/60">{item.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          </div>

          <div className="relative">
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-semibold text-ink transition hover:bg-canvas" onClick={() => setPanel(panel === 'wallet' ? null : 'wallet')} aria-label={profile ? shortWallet ? `身份钱包 ${shortWallet}` : '身份钱包' : '登录后关联钱包'} aria-expanded={panel === 'wallet'}>
            <WalletCards size={17} />
            <span className="hidden md:inline">{profile ? shortWallet ?? '身份钱包' : '登录后关联钱包'}</span>
          </button>
          {panel === 'wallet' ? (
            <div className="absolute right-0 top-12 w-72 rounded-2xl border border-line bg-white p-4 shadow-float">
              {profile ? <>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold"><span className={`size-2 rounded-full ${walletAddress ? 'bg-lime' : 'bg-warning'}`} />{walletAddress ? '身份钱包已连接' : linkedWalletAddress ? '钱包连接已中断' : 'Web2 身份已验证'}</span>
                  <span className="mono-chip">{provider === 'privy' ? 'PRIVY' : 'PINME'}</span>
                </div>
                {identityWallet ? <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{walletAddress ? 'Current signer' : 'Linked identity'}</p>
                  <p className="mt-2 break-all font-mono text-xs font-semibold text-ink">{identityWallet}</p>
                </div> : <p className="mt-4 text-sm leading-6 text-muted">当前账户使用 Web2 身份。关联钱包后可以用同一账户进行签名登录，无需创建第二套资料。</p>}
                {provider === 'privy' && profile && !walletAddress ? <button type="button" className="btn-signal mt-4 w-full" onClick={() => void linkWallet()}>{linkedWalletAddress ? '重新连接钱包' : '关联现有钱包'}</button> : null}
                <p className="mt-4 text-xs leading-5 text-muted">Web2 任务使用充值余额；Web3 任务可选择 Sepolia mUSDC 或 sETH，平台不会保管私钥。</p>
                <Link to="/wallet/test-funds" className="btn-secondary mt-4 w-full" onClick={() => setPanel(null)}>查看与领取测试资金</Link>
              </> : <p className="text-sm leading-6 text-muted">登录后可关联身份钱包，并进入经过 Worker 鉴权的任务托管与结算流程。</p>}
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function Toast() {
  const toast = useAppStore((state) => state.toast);
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(dismissToast, toast.tone === 'error' ? 7_000 : 4_500);
    return () => window.clearTimeout(timeout);
  }, [dismissToast, toast]);

  if (!toast) return null;

  const Icon = toast.tone === 'success' ? Check : toast.tone === 'error' ? AlertTriangle : Info;
  const title = toast.tone === 'success' ? '操作成功' : toast.tone === 'error' ? '操作未完成' : '提示';
  const iconClass = toast.tone === 'success'
    ? 'bg-lime/25 text-ink'
    : toast.tone === 'error'
      ? 'bg-danger/10 text-danger'
      : 'bg-cyan/10 text-cyan';

  return (
    <div
      className="fixed right-4 top-20 z-[80] flex w-[calc(100vw-2rem)] max-w-[400px] items-start gap-3 rounded-2xl border border-line bg-white p-4 text-ink shadow-float sm:right-6 xl:right-8"
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`}><Icon size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted">{toast.message}</p>
      </div>
      <button type="button" className="-mr-1 -mt-1 rounded-lg p-2 text-muted transition hover:bg-canvas hover:text-ink" onClick={dismissToast} aria-label="关闭提示"><X size={16} /></button>
    </div>
  );
}

function RouteContent() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <Suspense key={pathname} fallback={<div className="panel flex min-h-64 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />正在加载工作区…</div>}>
      <Outlet />
    </Suspense>
  );
}

export function AppShell() {
  const location = useLocation();
  const isWorkflowWorkspace = /^\/missions\/[^/]+\/workflow\/?$/.test(location.pathname);
  const isExecutionWorkspace = /^\/missions\/[^/]+\/execution\/?$/.test(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const focusMenuButton = () => window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  const closeMobileMenu = () => {
    setMobileOpen(false);
    if (!desktopSidebar) focusMenuButton();
  };
  const openMobileMenu = () => {
    setMobileOpen(true);
    window.requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus());
  };

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncLayout = () => {
      setDesktopSidebar(media.matches);
      if (media.matches) setMobileOpen(false);
    };
    syncLayout();
    media.addEventListener('change', syncLayout);
    return () => media.removeEventListener('change', syncLayout);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen, desktopSidebar]);

  useEffect(() => {
    if (!mobileOpen || desktopSidebar) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen, desktopSidebar]);

  useEffect(() => {
    if (!mobileOpen) return;
    setMobileOpen(false);
    if (!desktopSidebar) focusMenuButton();
  }, [location.pathname]);

  const openAuth = () => {
    setMobileOpen(false);
    setAuthOpen(true);
  };
  const closeAuth = () => {
    setAuthOpen(false);
    if (!desktopSidebar) focusMenuButton();
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={mobileOpen} interactive={desktopSidebar || mobileOpen} sidebarRef={sidebarRef} onClose={closeMobileMenu} onOpenAuth={openAuth} />
      <div className={`min-w-0 flex-1 ${isWorkflowWorkspace ? 'flex h-dvh min-h-0 flex-col overflow-hidden' : isExecutionWorkspace ? 'xl:flex xl:h-dvh xl:min-h-0 xl:flex-col xl:overflow-hidden' : ''}`}>
        <Topbar mobileMenuOpen={mobileOpen} menuButtonRef={menuButtonRef} onOpenMenu={openMobileMenu} />
        <main className={isWorkflowWorkspace
          ? 'mx-auto min-h-0 w-full max-w-[1800px] flex-1 overflow-hidden p-2.5 sm:p-3 md:p-4'
          : isExecutionWorkspace
            ? 'mx-auto w-full max-w-[1540px] p-4 pb-28 md:p-7 md:pb-28 xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:p-5'
          : 'mx-auto w-full max-w-[1540px] p-4 pb-28 md:p-7 md:pb-28 xl:p-8 xl:pb-28'}>
          <RouteContent />
        </main>
      </div>
      <Toast />
      <AuthDialog open={authOpen} onClose={closeAuth} />
    </div>
  );
}
