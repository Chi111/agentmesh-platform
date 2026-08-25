import { createOpenAI } from '@ai-sdk/openai';

const apiKey = process.env.PINME_API_KEY?.trim() ?? '';
const projectName = process.env.PINME_PROJECT_NAME?.trim() ?? '';
const baseUrl = (process.env.PINME_BASE_URL?.trim() || 'https://pinme.cloud').replace(/\/+$/, '');

const pinmeOpenAI = createOpenAI({
  name: 'pinme-openrouter',
  baseURL: `${baseUrl}/api/v1`,
  // PinMe authenticates with X-API-Key. The provider still requires a non-empty
  // OpenAI-style API key, so keep the real project key out of Authorization.
  apiKey: 'pinme-proxy',
  headers: apiKey ? { 'X-API-Key': apiKey } : {},
  fetch: async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    if (projectName) url.searchParams.set('project_name', projectName);
    return fetch(url, init);
  },
});

export const isPinmeLlmConfigured = Boolean(apiKey && projectName);

export const pinmeOpenAIModel = pinmeOpenAI.chat(
  process.env.PINME_MODEL?.trim() || 'deepseek/deepseek-v3.2',
);
