import { create } from 'zustand';
import { api, hasApiSession } from '../services/api';
import { trackProductEvent } from '../observability';
import type {
  Agent,
  CandidateMatch,
  Dispute,
  Mission,
  MissionDetail,
  NewAgentInput,
  NewDeliverableInput,
  NewMissionInput,
  NotificationItem,
  SyncStatus,
  UserProfile,
  UserRole,
  WorkflowStage,
  WorkflowEdge,
  WorkflowViewport,
} from '../types/domain';

const accents: Agent['accent'][] = ['cyan', 'lime', 'amber'];

function accentFor(id: string): Agent['accent'] {
  const hash = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return accents[hash % accents.length];
}

function normalizeAgent(agent: Agent): Agent {
  return { ...agent, accent: agent.accent ?? accentFor(agent.id) };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function requireApiSession() {
  if (!hasApiSession()) throw new Error('请先登录后再执行此操作。');
}

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastNotice {
  message: string;
  tone: ToastTone;
}

function notice(message: string, tone: ToastTone = 'success'): ToastNotice {
  return { message, tone };
}

interface AppState {
  role: UserRole;
  profile: UserProfile | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  missions: Mission[];
  agents: Agent[];
  notifications: NotificationItem[];
  disputes: Dispute[];
  missionStages: Record<string, WorkflowStage[]>;
  missionDetails: Record<string, MissionDetail>;
  candidateMatches: Record<string, CandidateMatch[]>;
  developerSummary: { jobs: number; activeAgents: number; volume: number; pending: number } | null;
  selectedAgents: Record<string, string>;
  toast: ToastNotice | null;
  setRole: (role: UserRole) => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
  hydratePublic: () => Promise<void>;
  hydratePrivate: () => Promise<void>;
  clearPrivateWorkspace: () => void;
  applyMissionDetail: (detail: MissionDetail) => void;
  loadMissionDetail: (missionId: string) => Promise<void>;
  loadCandidates: (missionId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  selectAgent: (stageId: string, agentId: string) => void;
  createMission: (input: NewMissionInput) => Promise<string>;
  compileWorkflow: (missionId: string) => Promise<void>;
  saveWorkflowDraft: (missionId: string, nodes: WorkflowStage[], edges: WorkflowEdge[], viewport: WorkflowViewport) => Promise<void>;
  confirmWorkflow: (missionId: string) => Promise<void>;
  startMission: (missionId: string, depositTxHash?: string | null) => Promise<void>;
  respondStageOffer: (missionId: string, offerId: string, decision: 'accepted' | 'declined') => Promise<void>;
  dispatchMission: (missionId: string) => Promise<void>;
  pauseMission: (missionId: string, reason: string) => Promise<void>;
  resumeMission: (missionId: string) => Promise<void>;
  createMissionChangeRequest: (missionId: string, input: { targetStageIds: string[]; reason: string; acceptanceCriteria: string }) => Promise<void>;
  decideGate: (missionId: string, nodeId: string, decision: 'approved' | 'rejected', feedback?: string, reworkNodeIds?: string[]) => Promise<void>;
  retryNode: (missionId: string, nodeId: string) => Promise<void>;
  submitDeliverable: (missionId: string, input: NewDeliverableInput) => Promise<void>;
  submitForReview: (missionId: string) => Promise<void>;
  requestAssistance: (missionId: string) => Promise<void>;
  registerAgent: (input: NewAgentInput) => Promise<string>;
  runAgentTrial: (agentId: string) => Promise<void>;
  toggleAgentStatus: (agentId: string) => Promise<void>;
  releasePayment: (missionId: string, releaseTxHash?: string | null) => Promise<void>;
  createDispute: (missionId: string, reason: string, freezeTxHash?: string | null) => Promise<void>;
  startDisputeReview: (disputeId: string, weightMode?: 'one_person_one_vote' | 'power') => Promise<void>;
  resolveDispute: (disputeId: string, resolution: string, status: 'resolved' | 'rejected', resolutionTxHash?: string | null) => Promise<void>;
  showToast: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  role: 'requester',
  profile: null,
  syncStatus: 'idle',
  syncError: null,
  missions: [],
  agents: [],
  notifications: [],
  disputes: [],
  missionStages: {},
  missionDetails: {},
  candidateMatches: {},
  developerSummary: null,
  selectedAgents: {},
  toast: null,
  setRole: async (role) => {
    set({ role });
    if (!hasApiSession()) return;
    try {
      const profile = await api.updateRole(role);
      set({ profile, role: profile.role === 'admin' ? role : profile.role });
      await get().hydratePrivate();
    } catch (error) {
      set({ toast: notice(error instanceof Error ? error.message : '角色切换失败。', 'error') });
      throw error;
    }
  },
  setProfile: (profile) => set({
    profile,
    role: profile?.role === 'developer' ? 'developer' : 'requester',
  }),
  hydratePublic: async () => {
    set({ syncStatus: 'loading', syncError: null });
    try {
      const agents = (await api.listAgents()).map(normalizeAgent);
      set((state) => state.profile ? { agents } : { agents, syncStatus: 'ready' });
    } catch (error) {
      set((state) => state.profile ? {} : {
        agents: [],
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : 'Agent 市场同步失败。',
      });
    }
  },
  hydratePrivate: async () => {
    if (!hasApiSession()) return;
    set({ syncStatus: 'loading', syncError: null });
    try {
      const [payload, disputes] = await Promise.all([api.bootstrap(), api.listDisputes()]);
      const notifications: NotificationItem[] = payload.notifications.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        tone: item.tone,
        unread: !item.read,
        time: formatTime(item.createdAt),
      }));
      set({
        profile: payload.profile,
        role: payload.profile.role === 'developer' ? 'developer' : 'requester',
        syncStatus: 'ready',
        missions: payload.missions,
        agents: payload.agents.map(normalizeAgent),
        notifications,
        disputes,
        developerSummary: payload.developer,
      });
    } catch (error) {
      set({
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : '工作区同步失败。',
      });
    }
  },
  clearPrivateWorkspace: () => set({
    profile: null,
    role: 'requester',
    syncStatus: 'idle',
    syncError: null,
    missions: [],
    agents: [],
    notifications: [],
    missionStages: {},
    missionDetails: {},
    candidateMatches: {},
    disputes: [],
    developerSummary: null,
    selectedAgents: {},
  }),
  applyMissionDetail: (detail) => set((state) => {
    const assignedAgents = Object.fromEntries(detail.stages.flatMap((stage) => (
      stage.agentId ? [[stage.id, stage.agentId]] : []
    )));
    return {
      missions: state.missions.some((mission) => mission.id === detail.mission.id)
        ? state.missions.map((mission) => mission.id === detail.mission.id ? detail.mission : mission)
        : [detail.mission, ...state.missions],
      missionStages: { ...state.missionStages, [detail.mission.id]: detail.stages },
      missionDetails: { ...state.missionDetails, [detail.mission.id]: detail },
      selectedAgents: { ...state.selectedAgents, ...assignedAgents },
    };
  }),
  loadMissionDetail: async (missionId) => {
    requireApiSession();
    const detail = await api.getMission(missionId);
    get().applyMissionDetail(detail);
  },
  loadCandidates: async (missionId) => {
    requireApiSession();
    const matches = await api.getCandidates(missionId);
    set((state) => {
      return {
        candidateMatches: { ...state.candidateMatches, [missionId]: matches.map((match) => ({
          ...match,
          candidates: match.candidates.map((candidate) => ({ ...candidate, agent: normalizeAgent(candidate.agent) })),
        })) },
      };
    });
  },
  markNotificationsRead: async () => {
    if (!hasApiSession()) return;
    await api.markNotificationsRead();
    set((state) => ({ notifications: state.notifications.map((item) => ({ ...item, unread: false })) }));
  },
  selectAgent: (stageId, agentId) => set((state) => ({ selectedAgents: { ...state.selectedAgents, [stageId]: agentId } })),
  createMission: async (input) => {
    requireApiSession();
    if (get().role !== 'requester') await get().setRole('requester');
    const { mission, stages } = await api.createMission(input);
    trackProductEvent('mission_created', { mode: 'live', category: mission.category, budget: mission.budget });
    set((state) => ({
      missions: [mission, ...state.missions.filter((item) => item.id !== mission.id)],
      missionStages: { ...state.missionStages, [mission.id]: stages },
      toast: notice('任务已写入 D1，AI 智能编排已生成并校验工作流。'),
    }));
    return mission.id;
  },
  compileWorkflow: async (missionId) => {
    requireApiSession();
    const result = await api.compileWorkflow(missionId);
    set((state) => ({
      missions: state.missions.map((mission) => mission.id === missionId ? result.mission : mission),
      missionStages: { ...state.missionStages, [missionId]: result.stages },
      missionDetails: state.missionDetails[missionId]
        ? { ...state.missionDetails, [missionId]: { ...state.missionDetails[missionId], mission: result.mission, stages: result.stages, edges: result.edges, offers: [] } }
        : state.missionDetails,
      toast: notice('AI 已按任务复杂度生成并校验 DAG 草稿，Agent 仍由你手动选择。'),
    }));
    await get().loadCandidates(missionId);
  },
  saveWorkflowDraft: async (missionId, nodes, edges, viewport) => {
    requireApiSession();
    const mission = get().missionDetails[missionId]?.mission ?? get().missions.find((item) => item.id === missionId);
    if (!mission) throw new Error('任务尚未加载。');
    const result = await api.saveWorkflowDraft(missionId, { workflowVersion: mission.workflowVersion, nodes, edges, viewport });
    set((state) => ({
      missions: state.missions.map((item) => item.id === missionId ? result.mission : item),
      missionStages: { ...state.missionStages, [missionId]: result.stages },
      missionDetails: state.missionDetails[missionId]
        ? { ...state.missionDetails, [missionId]: { ...state.missionDetails[missionId], mission: result.mission, stages: result.stages, edges: result.edges, offers: [] } }
        : state.missionDetails,
      selectedAgents: {
        ...state.selectedAgents,
        ...Object.fromEntries(result.stages.filter((stage) => stage.agentId).map((stage) => [stage.id, stage.agentId!])),
      },
      toast: notice(`DAG v${result.mission.workflowVersion} 已保存。`),
    }));
    await get().loadCandidates(missionId);
  },
  confirmWorkflow: async (missionId) => {
    requireApiSession();
    const stages = get().missionStages[missionId];
    if (!stages?.length) throw new Error('工作流阶段尚未加载。');
    const assignments = Object.fromEntries(stages.filter((stage) => stage.nodeType === 'task').map((stage) => {
      const agentId = get().selectedAgents[stage.id] ?? stage.agentId;
      if (!agentId) throw new Error(`请为“${stage.name}”选择 Agent。`);
      return [stage.id, agentId];
    }));
    const result = await api.confirmWorkflow(missionId, assignments);
    set((state) => ({
      missions: state.missions.map((mission) => mission.id === missionId ? result.mission : mission),
      missionStages: { ...state.missionStages, [missionId]: result.stages },
      missionDetails: state.missionDetails[missionId]
        ? { ...state.missionDetails, [missionId]: { ...state.missionDetails[missionId], mission: result.mission, stages: result.stages, edges: result.edges, offers: result.offers } }
        : state.missionDetails,
      toast: notice('阶段邀请已发送，等待所有 Agent 接单。'),
    }));
  },
  respondStageOffer: async (missionId, offerId, decision) => {
    requireApiSession();
    await api.respondStageOffer(missionId, offerId, decision);
    await get().loadMissionDetail(missionId);
    set({ toast: notice(decision === 'accepted' ? '已接受阶段邀请。' : '已拒绝阶段邀请，任务方可重新选人。', decision === 'accepted' ? 'success' : 'info') });
  },
  startMission: async (missionId, depositTxHash = null) => {
    requireApiSession();
    const { mission } = await api.startMission(missionId, depositTxHash);
    trackProductEvent('mission_started', { settlement: depositTxHash ? 'contract' : 'ledger' });
    set((state) => ({
      missions: state.missions.map((item) => item.id === missionId ? mission : item),
      toast: notice(depositTxHash ? '链上托管已验证，执行网络已启动。' : '托管账本已锁定，执行网络已启动。'),
    }));
  },
  dispatchMission: async (missionId) => {
    requireApiSession();
    const result = await api.dispatchMission(missionId);
    await get().loadMissionDetail(missionId);
    set({ toast: notice(result.agent && result.stage
      ? `${result.agent.name} 已接收“${result.stage.name}”，本轮共派发 ${result.dispatches.length} 个节点。`
      : `本轮已处理 ${result.dispatches.length} 个派发请求。`) });
  },
  pauseMission: async (missionId, reason) => {
    requireApiSession();
    const detail = await api.pauseMission(missionId, reason);
    get().applyMissionDetail(detail);
    set({ toast: notice(detail.mission.pauseMode === 'emergency' ? '任务已紧急暂停，新调度已阻断。' : '任务已暂停，在途终态回调仍会留痕。', 'info') });
  },
  resumeMission: async (missionId) => {
    requireApiSession();
    const detail = await api.resumeMission(missionId);
    get().applyMissionDetail(detail);
    set({ toast: notice('任务已恢复，调度检查点已对账。') });
  },
  createMissionChangeRequest: async (missionId, input) => {
    requireApiSession();
    const detail = await api.createMissionChangeRequest(missionId, input);
    get().applyMissionDetail(detail);
    set({ toast: notice(`返工 v${detail.changeRequests[0]?.version ?? ''} 已创建，旧 attempt 和输出已保留。`, 'info') });
  },
  decideGate: async (missionId, nodeId, decision, feedback, reworkNodeIds) => {
    requireApiSession();
    await api.decideGate(missionId, nodeId, { decision, feedback, reworkNodeIds });
    await get().loadMissionDetail(missionId);
    set({ toast: notice(decision === 'approved' ? '审批已通过，后继节点将自动调度。' : '审批已驳回，所选上游节点已进入返工。', decision === 'approved' ? 'success' : 'info') });
  },
  retryNode: async (missionId, nodeId) => {
    requireApiSession();
    await api.retryNode(missionId, nodeId);
    await get().loadMissionDetail(missionId);
    set({ toast: notice('失败节点已进入显式重试队列。') });
  },
  submitDeliverable: async (missionId, input) => {
    requireApiSession();
    await api.submitDeliverable(missionId, input);
    await get().loadMissionDetail(missionId);
    set({ toast: notice('交付物 URI 与内容哈希已写入证据链。') });
  },
  submitForReview: async (missionId) => {
    requireApiSession();
    const mission = await api.submitForReview(missionId);
    await get().loadMissionDetail(missionId);
    set((state) => ({ missions: state.missions.map((item) => item.id === missionId ? mission : item), toast: notice('任务已提交给任务方验收。') }));
  },
  requestAssistance: async (missionId) => {
    requireApiSession();
    const event = await api.addMissionEvent(missionId, {
      type: 'mission.assistance_requested',
      message: '任务方请求平台人工协助',
    });
    set((state) => {
      const detail = state.missionDetails[missionId];
      return {
        missions: state.missions.map((mission) => mission.id === missionId ? { ...mission, currentStage: '等待平台人工协助' } : mission),
        missionDetails: detail ? { ...state.missionDetails, [missionId]: { ...detail, events: [...detail.events, event] } } : state.missionDetails,
        toast: notice('人工协助请求已写入执行事件流。'),
      };
    });
  },
  registerAgent: async (input) => {
    requireApiSession();
    if (get().role !== 'developer') await get().setRole('developer');
    const agent = normalizeAgent(await api.registerAgent(input));
    set((state) => ({ agents: [agent, ...state.agents.filter((item) => item.id !== agent.id)], toast: notice('Agent 已写入 D1，等待 AI 试炼。') }));
    return agent.id;
  },
  runAgentTrial: async (agentId) => {
    requireApiSession();
    const result = await api.runAgentTrial(agentId);
    if (!result.agent) throw new Error('试炼结果缺少 Agent 数据。');
    const agent = normalizeAgent(result.agent);
    set((state) => ({
      agents: state.agents.map((item) => item.id === agentId ? agent : item),
      toast: notice(`AI 试炼完成：${result.score.toFixed(1)} / 10。${result.summary}`),
    }));
  },
  toggleAgentStatus: async (agentId) => {
    const current = get().agents.find((agent) => agent.id === agentId);
    if (!current) return;
    requireApiSession();
    const nextStatus = current.status === 'active' ? 'paused' : 'active';
    const updated = normalizeAgent(await api.updateAgentStatus(agentId, nextStatus));
    set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? updated : agent), toast: notice(`${updated.name} 已${nextStatus === 'active' ? '上线' : '暂停'}。`) }));
  },
  releasePayment: async (missionId, releaseTxHash = null) => {
    requireApiSession();
    const detail = await api.acceptMission(missionId, releaseTxHash);
    trackProductEvent('mission_accepted', { settlement: releaseTxHash ? 'contract' : 'ledger', budget: detail.mission.budget });
    set((state) => ({
      missions: state.missions.map((mission) => mission.id === missionId ? detail.mission : mission),
      missionDetails: { ...state.missionDetails, [missionId]: detail },
      toast: notice(releaseTxHash ? '链上资金已释放并完成服务端验证。' : '验收完成，分账与平台费账目已生成。'),
    }));
  },
  createDispute: async (missionId, reason, freezeTxHash = null) => {
    requireApiSession();
    const dispute = await api.createDispute(missionId, reason, freezeTxHash);
    set((state) => {
      const detail = state.missionDetails[missionId];
      return {
        disputes: [dispute, ...state.disputes],
        missionDetails: detail ? { ...state.missionDetails, [missionId]: { ...detail, disputes: [dispute, ...detail.disputes], escrow: detail.escrow ? { ...detail.escrow, status: 'frozen' } : null } } : state.missionDetails,
        toast: notice('争议已写入控制面，托管账本已冻结。'),
      };
    });
  },
  startDisputeReview: async (disputeId, weightMode = 'one_person_one_vote') => {
    requireApiSession();
    const dispute = await api.startDisputeReview(disputeId, weightMode);
    set((state) => ({
      disputes: state.disputes.map((item) => item.id === disputeId ? dispute : item),
      toast: notice('仲裁提案已创建，委员会快照已写入 D1。'),
    }));
  },
  resolveDispute: async (disputeId, resolution, status, resolutionTxHash = null) => {
    requireApiSession();
    const missionId = get().disputes.find((item) => item.id === disputeId)?.missionId;
    const dispute = await api.resolveDispute(disputeId, resolution, status, resolutionTxHash);
    set((state) => ({ disputes: state.disputes.map((item) => item.id === disputeId ? dispute : item), toast: notice('管理员裁决已写入控制面。') }));
    if (missionId) await get().loadMissionDetail(missionId);
  },
  showToast: (message, tone = 'info') => set({ toast: notice(message, tone) }),
  dismissToast: () => set({ toast: null }),
}));
