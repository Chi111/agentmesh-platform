export const DEVTOOL_PRESETS = [
  'live',
  'frontend-active',
  'deploy-active',
  'deploy-waiting',
  'deploy-failed',
  'deploy-done'
];

export function applyDevtoolPreset(viewModel, preset) {
  if (preset === 'live' || !DEVTOOL_PRESETS.includes(preset)) {
    return {
      ...clone(viewModel),
      devtool: {
        active: false,
        preset: 'live'
      }
    };
  }

  const preview = clone(viewModel);
  preview.devtool = {
    active: true,
    preset
  };
  preview.sourceStatus = {
    ...(preview.sourceStatus ?? {}),
    mode: 'devtool'
  };

  if (preset === 'frontend-active') {
    preview.statusLabel = 'running';
    preview.activeCommand = 'internal chill:run';
    preview.currentStage = 'execute';
    preview.currentFeature = 'devtool/frontend-preview';
    preview.currentTaskId = 'T-FE-PREVIEW';
    preview.nextSafeCommand = 'internal chill:review T-FE-PREVIEW';
    preview.activePlotId = 'Execute';
    preview.message = 'Devtool preview: frontend craftsperson is working in the active field.';
    preview.deployWorkshop = {
      ...preview.deployWorkshop,
      state: preview.deployWorkshop?.state === 'idle' ? 'idle' : 'ready',
      isDeploying: false,
      pipeline: 'idle',
      worker: null
    };
    preview.plots = markPlotActive(preview.plots, 'Execute', {
      kind: 'frontend',
      label: 'Frontend craftsperson',
      action: 'painting interface frames'
    });
    return preview;
  }

  preview.statusLabel = preset === 'deploy-done' ? 'completed' : preset === 'deploy-failed' ? 'failed' : 'running';
  preview.activeCommand = '/chill-ai deploy staging';
  preview.currentStage = preset.replace('deploy-', '');
  preview.currentFeature = 'deployment';
  preview.currentTaskId = 'deploy-devtool';
  preview.nextSafeCommand = '';
  preview.activePlotId = 'Finish';
  preview.plots = markPlotActive(preview.plots, 'Finish', null);

  const deployStates = {
    'deploy-active': {
      state: 'active',
      pipeline: 'packing',
      message: 'Devtool preview: release crates are moving through the deploy workshop.',
      worker: {
        kind: 'deploy',
        label: 'Deploy craftsperson',
        action: 'packing release crates'
      },
      signpost: ''
    },
    'deploy-waiting': {
      state: 'waiting',
      pipeline: 'approval',
      message: 'Devtool preview: deploy workshop is waiting at an approval signpost.',
      worker: {
        kind: 'deploy',
        label: 'Deploy craftsperson',
        action: 'waiting by the approval signpost'
      },
      signpost: 'deploy-preview-approval'
    },
    'deploy-failed': {
      state: 'failed',
      pipeline: 'rollback',
      message: 'Devtool preview: deploy workshop line is stopped for rollback repair.',
      worker: {
        kind: 'deploy',
        label: 'Deploy craftsperson',
        action: 'repairing the release line'
      },
      signpost: ''
    },
    'deploy-done': {
      state: 'done',
      pipeline: 'delivered',
      message: 'Devtool preview: release crates reached the server room.',
      worker: null,
      signpost: ''
    }
  };

  const deployState = deployStates[preset];
  preview.deployWorkshop = {
    ...(preview.deployWorkshop ?? {}),
    label: 'Deploy Workshop',
    isDeploying: true,
    ...deployState
  };
  preview.message = deployState.message;

  return preview;
}

function markPlotActive(plots, activePlotId, worker) {
  const activeIndex = plots.findIndex((plot) => plot.id === activePlotId);
  return plots.map((plot, index) => {
    let state = 'pending';
    if (index < activeIndex) state = 'done';
    if (index === activeIndex) state = 'active';
    return {
      ...plot,
      state,
      worker: index === activeIndex ? worker : null
    };
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
