import { afterEach, describe, expect, it, vi } from 'vitest';
import { callPinmeLlm } from './pinme';

const env = { API_KEY: 'project-key', PROJECT_NAME: 'agentmesh-test', BASE_URL: 'https://pinme.example.test' };
const messages = [{ role: 'user' as const, content: 'Return JSON' }];

describe('PinMe LLM response parsing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a non-streaming OpenRouter response and explicitly disables streaming', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => Response.json({
      choices: [{ message: { content: '{"deliverable":"# Done"}' } }],
    }));
    vi.stubGlobal('fetch', fetcher);

    await expect(callPinmeLlm(env, messages)).resolves.toEqual({ content: '{"deliverable":"# Done"}' });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: false });
  });

  it('combines SSE delta chunks returned by a streaming PinMe proxy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"choices":[{"delta":{"content":"{\\"deliverable\\":\\"# "}}]}',
      'data: {"choices":[{"delta":{"content":"Done\\"}"}}]}',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })));

    await expect(callPinmeLlm(env, messages)).resolves.toEqual({ content: '{"deliverable":"# Done"}' });
  });
});
