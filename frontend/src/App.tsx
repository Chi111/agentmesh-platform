import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { lazy, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth/AuthProvider';
import { AuthDialog } from './auth/AuthDialog';
import { AppShell } from './components/layout/AppShell';
import { ArbitrationPage } from './pages/ArbitrationPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamAssemblyPage } from './pages/TeamAssemblyPage';
import { useAppStore } from './store/useAppStore';

const AcceptancePage = lazy(() => import('./pages/AcceptancePage').then((module) => ({ default: module.AcceptancePage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage').then((module) => ({ default: module.AgentDetailPage })));
const AgentMarketPage = lazy(() => import('./pages/AgentMarketPage').then((module) => ({ default: module.AgentMarketPage })));
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
const TestFundsPage = lazy(() => import('./pages/TestFundsPage').then((module) => ({ default: module.TestFundsPage })));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage').then((module) => ({ default: module.WorkflowPage })));

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
  const [authOpen, setAuthOpen] = useState(false);

  if (status === 'loading') {
    return <div className="panel flex min-h-64 items-center justify-center text-sm text-muted">正在验证工作区身份…</div>;
  }

  if (status !== 'authenticated') {
    return <>
      <section className="mesh-grid rounded-2xl border border-white/10 bg-ink px-6 py-16 text-center text-white shadow-card">
        <p className="eyebrow text-cyan">Authenticated Workspace</p>
        <h1 className="mt-4 text-2xl font-semibold">登录后进入正式工作区</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">任务、Agent、交付证据和结算只通过已认证的 Worker 与 D1 流程处理，不再提供本地演示数据或沙盒写入。</p>
        <button type="button" className="btn-signal mt-7" onClick={() => setAuthOpen(true)}>登录 AgentMesh</button>
      </section>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </>;
  }

  return children;
}

const protectedPage = (page: ReactNode) => <RequireAuthenticated>{page}</RequireAuthenticated>;

export default function App() {
  return (
    <WorkspaceBootstrap><Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/screens/:screenId" element={<LegacyScreenRedirect />} />
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
        <Route path="/admin" element={protectedPage(<AdminPage />)} />
        <Route path="/developer" element={protectedPage(<DeveloperDashboardPage />)} />
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
