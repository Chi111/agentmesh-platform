const WORKFLOW_PLOTS = [
  { id: 'Intake', label: 'Intake', stageKeys: ['intake'] },
  { id: 'ProjectScan', label: 'Project Scan', stageKeys: ['projectscan', 'project-scan', 'scan'] },
  { id: 'SpecBuild', label: 'Specs', stageKeys: ['specbuild', 'spec-build', 'specs', 'prd'] },
  { id: 'Plan', label: 'Plan', stageKeys: ['plan', 'task-plan', 'map', 'chill-map', 'map-validated'] },
  { id: 'Execute', label: 'Execute', stageKeys: ['execute', 'chill-run'] },
  { id: 'Review', label: 'Review', stageKeys: ['review'] },
  { id: 'QA', label: 'QA', stageKeys: ['qa', 'test'] },
  { id: 'Persist', label: 'Persist', stageKeys: ['persist', 'lessons'] },
  { id: 'ContextReset', label: 'Reset', stageKeys: ['contextreset', 'context-reset', 'reset'] },
  { id: 'Finish', label: 'Finish', stageKeys: ['finish', 'completed', 'complete'] }
];

const FRONTEND_TERMS = [
  'frontend',
  'front-end',
  'ui',
  'ux',
  'css',
  'html',
  'react',
  'vue',
  'svelte',
  'browser',
  'responsive',
  'visual',
  'page',
  'screen',
  'component',
  'senior-frontend-engineer'
];

export function buildFarmViewModel(state) {
  const workflowState = state.workflowState ?? {};
  const status = normalize(workflowState.status || 'unknown');
  const deployWorkshop = buildDeployWorkshop(state);
  const activePlotId = inferActivePlotId(workflowState);
  const completed = status === 'completed';
  const failed = status === 'failed';
  const interrupted = Boolean(state.interrupt) || status === 'interrupted';
  const waiting = !deployWorkshop.isDeploying && (status === 'waiting-input' || status === 'waiting-approval');
  const activeIndex = WORKFLOW_PLOTS.findIndex((plot) => plot.id === activePlotId);
  const worker = buildWorker(state, activePlotId);

  const plots = WORKFLOW_PLOTS.map((plot, index) => {
    let plotState = 'pending';
    if (completed) plotState = 'done';
    else if (failed && plot.id === activePlotId) plotState = 'failed';
    else if (interrupted && plot.id === activePlotId) plotState = 'interrupted';
    else if (waiting && plot.id === activePlotId) plotState = 'waiting';
    else if (plot.id === activePlotId) plotState = 'active';
    else if (activeIndex > -1 && index < activeIndex) plotState = 'done';

    return {
      id: plot.id,
      label: plot.label,
      state: plotState,
      worker: plot.id === activePlotId ? worker : null
    };
  });

  return {
    title: 'Chill Farm Workflow',
    statusLabel: workflowState.status || 'unknown',
    activePlotId,
    activeCommand: workflowState.activeCommand || '',
    currentStage: workflowState.currentStage || '',
    currentFeature: workflowState.currentFeature || '',
    currentTaskId: workflowState.currentTaskId || '',
    nextSafeCommand: workflowState.nextSafeCommand || '',
    blockedGateId: workflowState.blockedGateId || '',
    resumeHint: interrupted ? '/chill-ai continue' : toPublicCommand(workflowState.nextSafeCommand),
    sourceStatus: state.sourceStatus ?? { mode: 'unknown' },
    worker,
    deployWorkshop,
    plots,
    farmLog: formatFarmLog(state.auditEvents ?? []),
    message: buildMessage(workflowState, state, { failed, interrupted, waiting, completed })
  };
}

function inferActivePlotId(workflowState) {
  const text = normalize(
    [
      workflowState.currentStage,
      workflowState.activeCommand,
      workflowState.lastSafeCheckpoint?.stage,
      workflowState.status
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (isDeployText(text)) return 'Finish';

  for (const plot of WORKFLOW_PLOTS) {
    if (plot.stageKeys.some((stageKey) => text.includes(normalize(stageKey)))) {
      return plot.id;
    }
  }

  return workflowState.status === 'completed' ? 'Finish' : 'Intake';
}

function buildWorker(state, activePlotId) {
  const text = normalize(
    [
      state.workflowState?.activeAgent,
      state.workflowState?.currentTaskId,
      state.workflowState?.currentFeature,
      state.currentTaskText
    ].join(' ')
  );

  if (activePlotId === 'Execute' && FRONTEND_TERMS.some((term) => text.includes(term))) {
    return {
      kind: 'frontend',
      label: 'Frontend craftsperson',
      action: 'painting interface frames'
    };
  }

  if (activePlotId === 'Execute') {
    return {
      kind: 'general',
      label: 'Chill craftsperson',
      action: 'tending the active plot'
    };
  }

  return null;
}

function buildDeployWorkshop(state) {
  const workflowState = state.workflowState ?? {};
  const status = normalize(workflowState.status || '');
  const stageText = normalize([workflowState.currentStage, workflowState.lastSafeCheckpoint?.stage].join(' '));
  const intentText = normalize(
    [
      workflowState.currentStage,
      workflowState.activeCommand,
      workflowState.currentFeature,
      workflowState.currentTaskId,
      workflowState.blockedGateId,
      workflowState.lastSafeCheckpoint?.stage
    ].join(' ')
  );
  const stateText = normalize(
    [
      intentText,
      workflowState.lastSafeCheckpoint?.summary
    ].join(' ')
  );
  const isDeploying = isDeployText(intentText);
  let workshopState = 'idle';
  let pipeline = 'idle';

  if (!isDeploying) {
    workshopState = status === 'completed' ? 'ready' : 'idle';
  } else if (status === 'waiting-approval' || status === 'waiting-input') {
    workshopState = 'waiting';
    pipeline = 'approval';
  } else if (status === 'failed' || stateText.includes('rollback')) {
    workshopState = 'failed';
    pipeline = 'rollback';
  } else if (status === 'completed' || stageText.includes('smokepassed') || stageText.includes('deployed')) {
    workshopState = 'done';
    pipeline = 'delivered';
  } else {
    workshopState = 'active';
    pipeline = 'packing';
  }

  return {
    state: workshopState,
    isDeploying,
    pipeline,
    signpost: workflowState.blockedGateId || '',
    worker:
      workshopState === 'active' || workshopState === 'waiting' || workshopState === 'failed'
        ? {
            kind: 'deploy',
            label: 'Deploy craftsperson',
            action: pipeline === 'rollback' ? 'repairing the release line' : 'packing release crates'
          }
        : null,
    label: 'Deploy Workshop'
  };
}

function formatFarmLog(events) {
  return events.slice(-5).reverse().map((event) => ({
    event: event.event || event.type || 'log',
    message: event.message || event.summary || event.command || JSON.stringify(event)
  }));
}

function buildMessage(workflowState, state, flags) {
  const deployWorkshop = buildDeployWorkshop(state);
  if (deployWorkshop.state === 'active') return 'The release cart is rolling through the deploy workshop.';
  if (deployWorkshop.state === 'waiting') return `The deploy workshop is waiting at ${deployWorkshop.signpost || 'an approval gate'}.`;
  if (deployWorkshop.state === 'failed') return 'The deploy workshop needs repair or rollback before shipping.';
  if (deployWorkshop.state === 'done') return 'The release crates reached the server room.';
  if (flags.completed) return 'The farmhouse lights are on. The workflow is complete.';
  if (flags.interrupted) return `Paused at ${workflowState.currentStage || 'current plot'}. Resume with /chill-ai continue.`;
  if (flags.failed) return `The active plot needs repair. Check ${toPublicCommand(workflowState.nextSafeCommand) || 'the latest audit log'}.`;
  if (flags.waiting) return `A signpost is waiting for input at ${workflowState.blockedGateId || workflowState.currentStage || 'this stage'}.`;
  if (state.sourceStatus?.mode === 'demo') return 'Demo mode: add .chill/state/workflow-state.json to watch a live farm.';
  return 'The farm is tending the current workflow state.';
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '');
}

function isDeployText(text) {
  return [
    'chill-deploy',
    'deploy',
    'deployment',
    'smoke',
    'rollback'
  ].some((term) => text.includes(normalize(term)));
}

function toPublicCommand(command) {
  if (!command) return '';
  const value = String(command);
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('/chill-resume')) return '/chill-ai continue';
  if (normalized.startsWith('/chill-approve')) return value.replace(/^\/chill-approve/i, '/chill-ai approve');
  if (normalized.startsWith('/chill-status')) return '/chill-ai status';
  if (normalized.startsWith('/chill-bug')) return '/chill-ai bug';
  if (normalized.startsWith('/chill-deploy')) return value.replace(/^\/chill-deploy/i, '/chill-ai deploy');
  if (normalized.startsWith('/chill-run')) return '/chill-ai continue';
  if (normalized.startsWith('/chill-review')) return '/chill-ai continue';
  if (normalized.startsWith('/chill-qa')) return '/chill-ai continue';
  if (normalized.startsWith('/chill-finish')) return '/chill-ai continue';
  return value;
}
