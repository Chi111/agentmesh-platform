import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readVisualizerState } from './lib/state-reader.mjs';
import { buildFarmViewModel } from './lib/workflow-view-model.mjs';
import { applyDevtoolPreset, DEVTOOL_PRESETS } from './lib/devtool-presets.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const projectRoot = resolve(process.argv[2] || process.cwd());
const port = Number(process.env.CHILL_VISUALIZER_PORT || process.argv[3] || 4177);
const host = process.env.CHILL_VISUALIZER_HOST || '127.0.0.1';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/state') {
    sendJson(response, buildFarmViewModel(readVisualizerState(projectRoot)));
    return;
  }

  if (url.pathname === '/api/devtool') {
    const preset = url.searchParams.get('preset') || 'live';
    const viewModel = buildFarmViewModel(readVisualizerState(projectRoot));
    sendJson(response, applyDevtoolPreset(viewModel, preset));
    return;
  }

  if (url.pathname === '/api/devtool/presets') {
    sendJson(response, { presets: DEVTOOL_PRESETS });
    return;
  }

  const filePath = resolve(publicDir, url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(filePath));
});

server.listen(port, host, () => {
  console.log(`Chill farm visualizer running at http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  console.log(`Watching project: ${projectRoot}`);
});

function sendJson(response, payload) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}
