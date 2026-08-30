import { Bot, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentFleetScene } from '../components/agent/AgentFleetScene';
import { useAppStore } from '../store/useAppStore';

export function AgentFleetPage() {
  const agents = useAppStore((state) => state.agents);
  const missions = useAppStore((state) => state.missions);
  const profile = useAppStore((state) => state.profile);
  const showToast = useAppStore((state) => state.showToast);
  const toggleAgentStatus = useAppStore((state) => state.toggleAgentStatus);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);
  const ownedAgents = agents.filter((agent) => agent.ownerId === profile?.id);
  const publicAgents = agents.filter((agent) => agent.official || agent.quality?.marketplaceStatus === 'listed');
  const demoMode = ownedAgents.length === 0;
  const visibleAgents = demoMode ? (publicAgents.length ? publicAgents : agents) : ownedAgents;

  const toggleAgent = async (agentId: string) => {
    if (demoMode) return;
    setBusyAgent(agentId);
    try {
      await toggleAgentStatus(agentId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent 操作失败。', 'error');
    } finally {
      setBusyAgent(null);
    }
  };

  if (!visibleAgents.length) {
    return <section className="agent-fleet-empty">
      <div>
        <span><Bot size={24} /></span>
        <p>3D DIGITAL WORKPLACE</p>
        <h1>空间里还没有 Agent</h1>
        <p>注册第一个 Agent 后，它会以数字员工的身份进入工位、任务台与休息区。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className="btn-signal" to="/developer/agents/new"><Plus size={16} />注册 Agent</Link>
        </div>
      </div>
    </section>;
  }

  return <AgentFleetScene agents={visibleAgents} missions={missions} busyAgentId={busyAgent} demoMode={demoMode} readOnly={demoMode} onToggleAgent={toggleAgent} />;
}
