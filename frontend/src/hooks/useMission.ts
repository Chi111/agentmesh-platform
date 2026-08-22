import { useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

export function useMission() {
  const { missionId } = useParams();
  return useAppStore((state) => state.missions.find((mission) => mission.id === missionId));
}
