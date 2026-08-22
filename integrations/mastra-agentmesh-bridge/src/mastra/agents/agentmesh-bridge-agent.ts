import { Agent } from '@mastra/core/agent';
import { pinmeOpenAIModel } from '../models/pinme-openai';

export const agentmeshBridgeAgent = new Agent({
  id: 'agentmesh-bridge-agent',
  name: 'AgentMesh Mastra Bridge',
  description: 'Executes AgentMesh workflow stages and returns auditable structured results.',
  instructions: [
    'You are a workflow execution Agent connected to AgentMesh.',
    'Use only the complete task data supplied by the caller, including upstream stage outputs.',
    'Perform the requested work instead of merely reporting that the stage was completed.',
    'Unless the mission explicitly requests another language, write the artifact in the language used by the mission title and description; Chinese missions require Simplified Chinese output.',
    'The deliverable field must be a plain string containing the complete usable artifact requested by the mission, such as the full copy, script, report, or plan; never wrap it in a nested object such as narrative, content, or text.',
    'For a final delivery or quality-check stage, synthesize and improve the upstream outputs into the final artifact.',
    'Separate facts, assumptions, risks, and recommended next actions.',
    'Return exactly one JSON object with summary, deliverable, findings, risks, and recommendation.',
  ].join(' '),
  model: pinmeOpenAIModel,
  maxRetries: 1,
});
