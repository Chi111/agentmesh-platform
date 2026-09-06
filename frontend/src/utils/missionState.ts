import type { Mission } from '../types/domain';

type MissionSummary = Pick<Mission, 'id' | 'status' | 'team' | 'currentStage'>;

export function routeForMission(mission: Pick<MissionSummary, 'id' | 'status' | 'team'>) {
  if (mission.status === 'draft' || mission.status === 'matching') {
    return `/missions/${mission.id}/workflow`;
  }
  if (mission.status === 'review' || mission.status === 'completed' || mission.status === 'cancelled') {
    return `/missions/${mission.id}/acceptance`;
  }
  return `/missions/${mission.id}/execution`;
}

export function missionStatusMeta(mission: Pick<MissionSummary, 'status' | 'team' | 'currentStage'>) {
  if (mission.status === 'matching') {
    if (mission.currentStage.includes('等待托管支付')) return { label: '待托管', tone: 'warning' as const };
    if (mission.currentStage.includes('拒绝')) return { label: '待重新组队', tone: 'warning' as const };
    if (mission.team.length > 0) return { label: '待接单', tone: 'info' as const };
    return { label: '匹配中', tone: 'info' as const };
  }

  const statusMeta = {
    draft: { label: '草稿', tone: 'neutral' as const },
    running: { label: '执行中', tone: 'info' as const },
    paused: { label: '已暂停', tone: 'warning' as const },
    review: { label: '待验收', tone: 'warning' as const },
    completed: { label: '已完成', tone: 'success' as const },
    cancelled: { label: '已退款终止', tone: 'neutral' as const },
  };
  return statusMeta[mission.status];
}
