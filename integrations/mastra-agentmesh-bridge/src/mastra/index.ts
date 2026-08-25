import { Mastra } from '@mastra/core/mastra';
import { deepseekChillCodingAgent } from './agents/deepseek-chill-coding-agent';
import { agentmeshEndpoint, agentmeshEndpointInfo } from './routes/agentmesh';

export const mastra = new Mastra({
  agents: { deepseekChillCodingAgent },
  server: {
    apiRoutes: [agentmeshEndpointInfo, agentmeshEndpoint],
  },
});
