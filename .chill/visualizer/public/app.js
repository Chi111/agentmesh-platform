const farmPath = document.querySelector('#farmPath');
let deployWorkshop = document.querySelector('#deployWorkshop');
const sourceBadge = document.querySelector('#sourceBadge');
const statusValue = document.querySelector('#statusValue');
const stageValue = document.querySelector('#stageValue');
const taskValue = document.querySelector('#taskValue');
const nextValue = document.querySelector('#nextValue');
const farmMessage = document.querySelector('#farmMessage');
const farmLog = document.querySelector('#farmLog');
const devtoolValue = document.querySelector('#devtoolValue');
const devtoolButtons = [...document.querySelectorAll('[data-devtool-preset]')];

let previousPayload = '';
let devtoolPreset = 'live';

async function refresh() {
  try {
    const endpoint =
      devtoolPreset === 'live'
        ? '/api/state'
        : `/api/devtool?preset=${encodeURIComponent(devtoolPreset)}`;
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const viewModel = await response.json();
    const serialized = JSON.stringify(viewModel);
    if (serialized !== previousPayload) {
      previousPayload = serialized;
      render(viewModel);
    }
  } catch (error) {
    renderError(error);
  }
}

function render(viewModel) {
  sourceBadge.textContent = viewModel.sourceStatus?.mode === 'live' ? 'Live' : 'Demo';
  if (viewModel.devtool?.active) sourceBadge.textContent = 'Devtool';
  sourceBadge.dataset.mode = viewModel.sourceStatus?.mode || 'unknown';
  statusValue.textContent = viewModel.statusLabel || 'unknown';
  stageValue.textContent = viewModel.currentStage || viewModel.activePlotId || 'unknown';
  taskValue.textContent = viewModel.currentTaskId || 'none';
  nextValue.textContent = viewModel.nextSafeCommand || viewModel.resumeHint || 'none';
  farmMessage.textContent = viewModel.message || '';

  farmPath.replaceChildren(...viewModel.plots.map(renderPlot));
  deployWorkshop.replaceWith(renderDeployWorkshop(viewModel.deployWorkshop));
  deployWorkshop = document.querySelector('#deployWorkshop');
  farmLog.replaceChildren(...viewModel.farmLog.map(renderLogItem));
  renderDevtool(viewModel.devtool);
}

function renderPlot(plot, index) {
  const plotElement = document.createElement('article');
  plotElement.className = `plot plot-${plot.state} plot-${plot.id.toLowerCase()}`;
  plotElement.style.setProperty('--plot-index', index);
  plotElement.setAttribute('aria-label', `${plot.label}: ${plot.state}`);

  const soil = document.createElement('div');
  soil.className = 'soil';

  const crop = document.createElement('div');
  crop.className = 'crop';
  crop.append(createCropTop(), createCropStem());

  const sign = document.createElement('div');
  sign.className = 'plot-sign';
  sign.textContent = plot.label;

  soil.append(crop);
  if (plot.worker) soil.append(renderWorker(plot.worker));
  plotElement.append(soil, sign);

  return plotElement;
}

function renderWorker(worker) {
  const workerElement = document.createElement('div');
  workerElement.className = `worker worker-${worker.kind}`;
  workerElement.setAttribute('aria-label', worker.label);
  workerElement.title = `${worker.label}: ${worker.action}`;

  workerElement.innerHTML = `
    <div class="worker-head"></div>
    <div class="worker-body"></div>
    <div class="worker-arm"></div>
    <div class="worker-tool"></div>
    <div class="worker-leg worker-leg-a"></div>
    <div class="worker-leg worker-leg-b"></div>
    <div class="ui-frame"></div>
  `;

  return workerElement;
}

function renderDeployWorkshop(workshop) {
  const section = document.createElement('section');
  section.id = 'deployWorkshop';
  section.className = `deploy-workshop deploy-${workshop?.state || 'idle'}`;
  section.setAttribute('aria-label', `Deploy workshop: ${workshop?.state || 'idle'}`);

  const sign = document.createElement('div');
  sign.className = 'workshop-sign';
  sign.textContent = workshop?.label || 'Deploy Workshop';

  const exit = document.createElement('div');
  exit.className = 'shipping-road';
  exit.innerHTML = '<span></span><span></span><span></span>';

  const cart = document.createElement('div');
  cart.className = 'release-cart';
  cart.innerHTML = '<div class="cart-crate"></div><div class="cart-wheel cart-wheel-a"></div><div class="cart-wheel cart-wheel-b"></div>';

  const line = document.createElement('div');
  line.className = 'packing-line';
  line.innerHTML = '<div class="belt"></div><div class="package package-a"></div><div class="package package-b"></div><div class="stamp"></div>';

  const server = document.createElement('div');
  server.className = 'server-room';
  server.innerHTML = '<div class="server-light"></div><div class="server-slot"></div><div class="server-slot"></div><div class="server-slot"></div>';

  const status = document.createElement('div');
  status.className = 'workshop-status';
  status.textContent = describeWorkshop(workshop);

  section.append(sign, exit, cart, line, server);
  if (workshop?.worker) section.append(renderWorker(workshop.worker));
  section.append(status);

  return section;
}

function describeWorkshop(workshop) {
  if (!workshop) return 'Waiting for release work';
  if (workshop.state === 'active') return 'Packing release crates';
  if (workshop.state === 'waiting') return `Approval signpost: ${workshop.signpost || 'waiting'}`;
  if (workshop.state === 'failed') return 'Line stopped for repair or rollback';
  if (workshop.state === 'done') return 'Delivered to server room';
  if (workshop.state === 'ready') return 'Ready for the next release';
  return 'Workshop idle';
}

function createCropTop() {
  const cropTop = document.createElement('span');
  cropTop.className = 'crop-top';
  return cropTop;
}

function createCropStem() {
  const cropStem = document.createElement('span');
  cropStem.className = 'crop-stem';
  return cropStem;
}

function renderLogItem(entry) {
  const item = document.createElement('li');
  item.textContent = `${entry.event}: ${entry.message}`;
  return item;
}

function renderError(error) {
  sourceBadge.textContent = 'Offline';
  sourceBadge.dataset.mode = 'failed';
  farmMessage.textContent = `Visualizer cannot read state: ${error.message}`;
}

function renderDevtool(devtool) {
  const activePreset = devtool?.preset || devtoolPreset;
  devtoolValue.textContent = activePreset === 'live' ? 'Live state' : activePreset;
  for (const button of devtoolButtons) {
    button.classList.toggle('active', button.dataset.devtoolPreset === activePreset);
  }
}

for (const button of devtoolButtons) {
  button.addEventListener('click', () => {
    devtoolPreset = button.dataset.devtoolPreset;
    previousPayload = '';
    refresh();
  });
}

refresh();
setInterval(refresh, 1000);
