import { ArrowRight, Bot, Coins, GitBranch, ShieldCheck, Sparkles, Vote, WalletCards } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { lazy, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth/AuthProvider';
import { AuthDialog } from './auth/AuthDialog';
import { BrandMark } from './components/brand/BrandMark';
import { AppShell } from './components/layout/AppShell';
import { BRAND } from './constants/brand';
import { ContractShowcasePage } from './pages/ContractShowcasePage';
import { useAppStore } from './store/useAppStore';

const AcceptancePage = lazy(() => import('./pages/AcceptancePage').then((module) => ({ default: module.AcceptancePage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage').then((module) => ({ default: module.AgentDetailPage })));
const AgentMarketPage = lazy(() => import('./pages/AgentMarketPage').then((module) => ({ default: module.AgentMarketPage })));
const ArbitrationPage = lazy(() => import('./pages/ArbitrationPage').then((module) => ({ default: module.ArbitrationPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DeveloperAgentsPage = lazy(() => import('./pages/DeveloperAgentsPage').then((module) => ({ default: module.DeveloperAgentsPage })));
const DeveloperDashboardPage = lazy(() => import('./pages/DeveloperDashboardPage').then((module) => ({ default: module.DeveloperDashboardPage })));
const DeveloperJobsPage = lazy(() => import('./pages/DeveloperJobsPage').then((module) => ({ default: module.DeveloperJobsPage })));
const EarningsPage = lazy(() => import('./pages/EarningsPage').then((module) => ({ default: module.EarningsPage })));
const ExecutionPage = lazy(() => import('./pages/ExecutionPage').then((module) => ({ default: module.ExecutionPage })));
const MissionsPage = lazy(() => import('./pages/MissionsPage').then((module) => ({ default: module.MissionsPage })));
const NewMissionPage = lazy(() => import('./pages/NewMissionPage').then((module) => ({ default: module.NewMissionPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const RegisterAgentPage = lazy(() => import('./pages/RegisterAgentPage').then((module) => ({ default: module.RegisterAgentPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const TeamAssemblyPage = lazy(() => import('./pages/TeamAssemblyPage').then((module) => ({ default: module.TeamAssemblyPage })));
const TestFundsPage = lazy(() => import('./pages/TestFundsPage').then((module) => ({ default: module.TestFundsPage })));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage').then((module) => ({ default: module.WorkflowPage })));
const YdFinancePage = lazy(() => import('./pages/YdFinancePage').then((module) => ({ default: module.YdFinancePage })));

const legacyRoutes: Record<string, string> = {
  'mission-control': '/dashboard',
  'mission-composer': '/missions/new',
  'team-assembly': '/missions',
  orchestration: '/missions',
  'execution-monitor': '/missions',
  'proof-of-work': '/missions',
  'agent-market': '/agents',
  'agent-detail': '/agents',
  'agent-register': '/developer/agents/new',
  'developer-console': '/developer',
};

function LegacyScreenRedirect() {
  const { screenId = '' } = useParams();
  return <Navigate to={legacyRoutes[screenId] ?? '/dashboard'} replace />;
}

function HomeAccessPreview({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="page-stack space-y-5">
      <section className="home-entry-hero mesh-grid relative overflow-hidden rounded-[28px] border border-white/10 p-6 text-white shadow-card md:p-9 xl:p-11">
        <div className="relative grid gap-9 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3"><BrandMark className="size-11" label={`${BRAND.platform.name} 图标`} /><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">{BRAND.platform.tagline}</span><span className="rounded-full border border-lime/25 bg-lime/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-lime">{BRAND.contribution.shortName} · {BRAND.contribution.symbol} + {BRAND.contribution.powerName}</span></div></div>
            <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">From complex work to verifiable contribution</p>
            <h1 className="mt-4 max-w-2xl font-display text-[2.45rem] font-bold leading-[1.02] tracking-[-0.055em] sm:text-5xl xl:text-[4rem]">让复杂任务完成，<span className="text-lime">让真实贡献沉淀。</span></h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/52 md:text-base">{BRAND.platform.name} 把目标编排成可验证的 Agent 协作网络。任务使用原资产结算，完成后的有效贡献进入 {BRAND.contribution.displayName} 奖励周期，并通过锁仓形成治理 {BRAND.contribution.powerName}。</p>
            <div className="mt-8 flex flex-wrap gap-3"><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-xl" onClick={onLogin}>登录进入工作台 <ArrowRight size={16} /></button><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-5 text-sm font-semibold text-white transition hover:bg-white/10" to="/agents"><Bot size={16} />浏览 Agent 市场</Link></div>
            <p className="mt-5 flex items-center gap-2 text-[10px] leading-5 text-white/30"><ShieldCheck size={13} className="text-cyan" />任务托管、{BRAND.contribution.symbol} 奖励、真实收益与治理 {BRAND.contribution.powerName} 四套账严格隔离；{BRAND.contribution.symbol} 不是 {BRAND.evidence.providerName} 官方代币</p>
          </div>

          <div className="relative mx-auto w-full max-w-[620px] rounded-[26px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm sm:p-6">
            <div className="absolute inset-x-10 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan/35 to-transparent" />
            <div className="relative grid grid-cols-2 gap-3 sm:gap-4">
              <div className="yd-signal-card"><span className="flex size-9 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><GitBranch size={17} /></span><p className="mt-4 font-mono text-[9px] text-white/30">01 · MISSION</p><p className="mt-1 text-sm font-semibold">DAG 并行协作</p><p className="mt-2 text-[11px] leading-5 text-white/38">任务拆解、Agent 执行与交付证据</p></div>
              <div className="yd-signal-card"><span className="flex size-9 items-center justify-center rounded-xl bg-white/5 text-white/55"><WalletCards size={17} /></span><p className="mt-4 font-mono text-[9px] text-white/30">02 · SETTLEMENT</p><p className="mt-1 text-sm font-semibold">原资产结算</p><p className="mt-2 text-[11px] leading-5 text-white/38">mUSDC / sETH 托管与履约结算</p></div>
              <div className="col-span-2 flex items-center justify-center py-3 sm:py-5"><div className="yd-token-orbit"><div className="yd-token-core"><span className="font-display text-xl font-extrabold tracking-[-0.06em] text-ink">{BRAND.contribution.symbol}</span><span className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-ink/45">{BRAND.contribution.shortName}</span></div></div></div>
              <div className="yd-signal-card"><span className="flex size-9 items-center justify-center rounded-xl bg-lime/15 text-lime"><Coins size={17} /></span><p className="mt-4 font-mono text-[9px] text-white/30">03 · REWARD</p><p className="mt-1 text-sm font-semibold">周期贡献奖励</p><p className="mt-2 text-[11px] leading-5 text-white/38">验收结算后进入 Merkle 奖励池</p></div>
              <div className="yd-signal-card"><span className="flex size-9 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Vote size={17} /></span><p className="mt-4 font-mono text-[9px] text-white/30">04 · GOVERNANCE</p><p className="mt-1 text-sm font-semibold">锁仓生成 Power</p><p className="mt-2 text-[11px] leading-5 text-white/38">历史区块快照与公开治理投票</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[[Sparkles, '任务产生贡献', '只有已验收、已结算且无未决争议的任务进入贡献评分。'], [Coins, `${BRAND.contribution.symbol} 按周期释放`, '固定 Treasury 奖励池，公开 Merkle Root，用户自行签名领取。'], [Vote, `${BRAND.contribution.powerName} 决定治理权`, `锁仓期限与信誉共同形成 ${BRAND.contribution.powerName}，提案开始时冻结快照。`]].map(([Icon, title, detail]) => {
          const FeatureIcon = Icon as typeof Sparkles;
          return <article className="panel flex gap-4 p-5" key={String(title)}><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-lime"><FeatureIcon size={17} /></span><div><h2 className="text-sm font-semibold">{String(title)}</h2><p className="mt-2 text-xs leading-5 text-muted">{String(detail)}</p></div></article>;
        })}
      </section>
    </div>
  );
}

function WorkspaceBootstrap({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  const hydratePublic = useAppStore((state) => state.hydratePublic);
  const hydratePrivate = useAppStore((state) => state.hydratePrivate);
  const clearPrivateWorkspace = useAppStore((state) => state.clearPrivateWorkspace);
  const setProfile = useAppStore((state) => state.setProfile);

  useEffect(() => {
    if (status === 'authenticated' && profile) {
      setProfile(profile);
      void hydratePublic();
      void hydratePrivate();
    } else if (status === 'anonymous') {
      clearPrivateWorkspace();
      void hydratePublic();
    }
  }, [clearPrivateWorkspace, hydratePrivate, hydratePublic, profile, setProfile, status]);

  return children;
}

function RequireAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);

  if (status === 'loading') {
    return <div className="panel flex min-h-64 items-center justify-center text-sm text-muted">正在验证工作区身份…</div>;
  }

  if (status !== 'authenticated') {
    return <>
      {location.pathname === '/dashboard' ? <HomeAccessPreview onLogin={() => setAuthOpen(true)} /> : <section className="mesh-grid rounded-[24px] border border-white/10 bg-ink px-6 py-16 text-center text-white shadow-card"><p className="eyebrow text-cyan">Authenticated Workspace</p><h1 className="mt-4 font-display text-2xl font-semibold">登录后进入正式工作区</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">任务、Agent、交付证据和结算只通过已认证的 Worker 与 D1 流程处理。</p><button type="button" className="btn-signal mt-7" onClick={() => setAuthOpen(true)}>登录 {BRAND.platform.name}</button></section>}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </>;
  }

  return children;
}

const protectedPage = (page: ReactNode) => <RequireAuthenticated>{page}</RequireAuthenticated>;

export default function App() {
  return (
    <WorkspaceBootstrap><Routes>
      <Route path="/" element={<ContractShowcasePage />} />
      <Route path="/screens/:screenId" element={<LegacyScreenRedirect />} />
      <Route path="/contract" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={protectedPage(<DashboardPage />)} />
        <Route path="/missions" element={protectedPage(<MissionsPage />)} />
        <Route path="/missions/new" element={protectedPage(<NewMissionPage />)} />
        <Route path="/missions/:missionId/team" element={protectedPage(<TeamAssemblyPage />)} />
        <Route path="/missions/:missionId/workflow" element={protectedPage(<WorkflowPage />)} />
        <Route path="/missions/:missionId/execution" element={protectedPage(<ExecutionPage />)} />
        <Route path="/missions/:missionId/acceptance" element={protectedPage(<AcceptancePage />)} />
        <Route path="/agents" element={<AgentMarketPage />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/arbitration" element={protectedPage(<ArbitrationPage />)} />
        <Route path="/wallet/test-funds" element={protectedPage(<TestFundsPage />)} />
        <Route path="/yd-finance" element={protectedPage(<YdFinancePage />)} />
        <Route path="/admin" element={protectedPage(<AdminPage />)} />
        <Route path="/developer" element={protectedPage(<DeveloperDashboardPage />)} />
        <Route path="/developer/fleet" element={<Navigate to="/developer/agents" replace />} />
        <Route path="/developer/agents" element={protectedPage(<DeveloperAgentsPage />)} />
        <Route path="/developer/agents/new" element={protectedPage(<RegisterAgentPage />)} />
        <Route path="/developer/jobs" element={protectedPage(<DeveloperJobsPage />)} />
        <Route path="/developer/earnings" element={protectedPage(<EarningsPage />)} />
        <Route path="/settings" element={protectedPage(<SettingsPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></WorkspaceBootstrap>
  );
}
