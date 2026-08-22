import { Mastra } from '@mastra/core/mastra';
import { agentmeshBridgeAgent } from './agents/agentmesh-bridge-agent';
import { agentmeshEndpoint, agentmeshEndpointInfo } from './routes/agentmesh';

export const mastra = new Mastra({
  agents: { agentmeshBridgeAgent },
  server: {
    apiRoutes: [agentmeshEndpointInfo, agentmeshEndpoint],
    middleware: {
      path: '/api/agents/*',
      handler: async c => c.json({
        error: 'Direct Mastra agent access is disabled; use the AgentMesh dispatch endpoint.',
      }, 404),
    },
  },
});
