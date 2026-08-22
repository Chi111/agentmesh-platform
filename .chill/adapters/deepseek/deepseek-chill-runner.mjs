import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [prdPath = './docs/prd.md', projectPath = '.'] = process.argv.slice(2);
const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  console.error('Missing DEEPSEEK_API_KEY.');
  process.exit(1);
}

const prd = readFileSync(resolve(prdPath), 'utf8');
const chill = readFileSync(resolve(projectPath, '.chill/internal/commands/chill:from-prd.md'), 'utf8');

const body = {
  model: 'deepseek-v4-pro',
  messages: [
    {
      role: 'system',
      content: 'You are a project workflow assistant. Follow Chill Workflow and output specs, task plan, state, gates, and risks. Use fixed Chill Mermaid diagrams as references, not generated workflow replacements.'
    },
    {
      role: 'user',
      content: `Chill command:\n\n${chill}\n\nPRD:\n\n${prd}`
    }
  ],
  thinking: { type: 'enabled' },
  reasoning_effort: 'high',
  stream: false
};

const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify(body)
});

if (!response.ok) {
  console.error(`DeepSeek request failed: ${response.status} ${response.statusText}`);
  console.error(await response.text());
  process.exit(1);
}

const json = await response.json();
console.log(json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2));
