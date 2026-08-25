import { Navigate, useParams } from 'react-router-dom';

export function TeamAssemblyPage() {
  const { missionId = '' } = useParams();
  return <Navigate to={`/missions/${encodeURIComponent(missionId)}/workflow`} replace />;
}
