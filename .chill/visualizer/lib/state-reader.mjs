import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function readVisualizerState(projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const stateDir = join(root, '.chill', 'state');
  const workflowPath = join(stateDir, 'workflow-state.json');
  const examplePath = join(stateDir, 'workflow-state.example.json');
  const hasLiveState = existsSync(workflowPath);
  const workflowState =
    readJsonIfExists(hasLiveState ? workflowPath : examplePath) ?? createDemoWorkflowState();

  return {
    workflowState,
    auditEvents: readAuditEvents(join(stateDir, 'audit-log.jsonl'), hasLiveState),
    approvals: readJsonIfExists(join(stateDir, 'approvals.json')),
    interrupt: readJsonIfExists(join(stateDir, 'interrupt.json')),
    currentTaskText: readCurrentTaskText(root, workflowState),
    sourceStatus: {
      mode: hasLiveState ? 'live' : 'demo',
      workflowStatePath: hasLiveState ? workflowPath : examplePath,
      updatedAt: new Date().toISOString()
    }
  };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      parseError: error.message,
      path
    };
  }
}

function readAuditEvents(path, hasLiveState) {
  if (!existsSync(path)) {
    return hasLiveState
      ? []
      : [
          {
            event: 'demo-started',
            message: 'Demo state is active because workflow-state.json is not present.'
          }
        ];
  }

  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { event: 'log', message: line };
      }
    })
    .slice(-50);
}

function readCurrentTaskText(projectRoot, workflowState) {
  const taskId = workflowState?.currentTaskId;
  const featurePath = workflowState?.currentFeature;
  if (!taskId || !featurePath) return '';

  const tasksPath = join(projectRoot, featurePath, 'tasks.md');
  if (!existsSync(tasksPath)) return '';

  const lines = readFileSync(tasksPath, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(taskId));
  if (start === -1) return '';

  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^[-*]\s+\[[ xX-]\]\s+T-\d+/.test(line)) break;
    if (index > start && /^##+\s+/.test(line)) break;
    collected.push(line);
    if (collected.length >= 12) break;
  }

  return collected.join('\n').trim();
}

function createDemoWorkflowState() {
  return {
    version: 1,
    status: 'running',
    activeCommand: 'internal chill:run',
    currentStage: 'execute',
    currentFeature: 'specs/1.feature-name',
    currentTaskId: 'T-005',
    activeAgent: 'senior-frontend-engineer',
    lastSafeCheckpoint: {
      stage: 'before-task-execution',
      completedAt: '2026-06-14T09:00:00.000Z',
      summary: 'Specs generated and task selected.'
    },
    nextSafeCommand: 'internal chill:review T-005',
    blockedGateId: null,
    autoRun: true,
    updatedAt: '2026-06-14T09:00:00.000Z'
  };
}
