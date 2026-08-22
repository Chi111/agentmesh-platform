import { Mastra } from '@mastra/core/mastra';
import { agentmeshBridgeAgent } from './agents/agentmesh-bridge-agent';
import { agentmeshEndpoint, agentmeshEndpointInfo } from './routes/agentmesh';

export const mastra = new Mastra({
  agents: { agentmeshBridgeAgent },
  server: {
    apiRoutes: [agentmeshEndpointInfo, agentmeshEndpoint],
  },
});
