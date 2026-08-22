import { Agent } from '@mastra/core/agent';
import { pinmeOpenAIModel } from '../models/pinme-openai';

export const agentmeshBridgeAgent = new Agent({
  id: 'agentmesh-bridge-agent',
  name: 'AgentMesh Mastra Bridge',
  description: 'Executes AgentMesh workflow stages and returns auditable structured results.',
  instructions: [
    'You are a workflow execution Agent connected to AgentMesh.',
    'Use only the task data supplied by the caller.',
    'Separate facts, assumptions, risks, and recommended next actions.',
    'Return exactly one JSON object with summary, findings, risks, and recommendation.',
  ].join(' '),
  model: pinmeOpenAIModel,
  maxRetries: 1,
});
