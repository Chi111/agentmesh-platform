export interface PinmeEnv {
  API_KEY?: string;
  PROJECT_NAME?: string;
  BASE_URL?: string;
  LLM_MODEL?: string;
  BUILTIN_AGENT_MODEL?: string;
  /** Optional platform fallback; task-owner credentials are preferred and encrypted per user. */
  PINME_UPLOAD_APP_KEY?: string;
  PINME_UPLOAD_BASE_URL?: string;
}

export interface PinmeLlmOptions {
  model?: string;
  timeoutMs?: number;
}

type OpenRouterChatChunk = {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
    text?: string;
  }>;
};

type PinmeEnvelope<T = unknown> = {
  code: number;
  msg: string;
  data?: T;
};

export interface VerifiedIdentity {
  uid: string;
  provider: 'pinme' | 'privy';
  email?: string;
  displayName?: string;
  walletAddress?: string;
  /** True only when the provider supplied its complete current external-wallet list. */
  walletAddressAuthoritative?: boolean;
  claims: Record<string, unknown>;
}

export async function extractPinmeError(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = await response.clone().json() as PinmeEnvelope | { error?: string | { message?: string } };
    if ('data' in body && body.data && typeof body.data === 'object' && 'error' in body.data) {
      return String((body.data as { error: unknown }).error);
    }
    if ('msg' in body && body.msg) return body.msg;
    if ('error' in body) {
      if (typeof body.error === 'string') return body.error;
      if (body.error?.message) return body.error.message;
    }
  } catch {
    try {
      const body = await response.text();
      if (body) return body;
    } catch {
      // Fall through to the status-based error.
    }
  }
  return fallback;
}

function pinmeConfig(env: PinmeEnv): { apiKey: string; projectName: string; baseUrl: string } | null {
  if (!env.API_KEY || !env.PROJECT_NAME) return null;
  return {
    apiKey: env.API_KEY,
    projectName: env.PROJECT_NAME,
    baseUrl: env.BASE_URL ?? 'https://pinme.cloud',
  };
}

function chatChunkContent(chunk: OpenRouterChatChunk): string {
  const choice = chunk.choices?.[0];
  return choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? '';
}

function parseChatCompletionBody(body: string): string | null {
  try {
    const content = chatChunkContent(JSON.parse(body) as OpenRouterChatChunk);
    if (content) return content;
  } catch {
    // Streaming responses are parsed as SSE below.
  }

  let content = '';
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { content += chatChunkContent(JSON.parse(payload) as OpenRouterChatChunk); }
    catch { /* Ignore non-JSON SSE keepalive/event lines. */ }
  }
  return content || null;
}

export async function registerPinmeUser(
  env: PinmeEnv,
  payload: { email: string; password: string; display_name?: string },
): Promise<{ user?: Record<string, unknown>; status: number; error?: string }> {
  const config = pinmeConfig(env);
  if (!config) return { status: 503, error: 'Auth service is not configured' };
  const response = await fetch(
    `${config.baseUrl}/api/v1/auth/create_user?project_name=${encodeURIComponent(config.projectName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(payload),
    },
  );
  const result = await response.json() as PinmeEnvelope<Record<string, unknown> | { error?: string }>;
  if (!response.ok || result.code !== 200) {
    const data = result.data as { error?: string } | undefined;
    return { status: response.status, error: data?.error ?? result.msg ?? 'Registration failed' };
  }
  return { status: 200, user: result.data as Record<string, unknown> };
}

export async function verifyPinmeToken(env: PinmeEnv, idToken: string): Promise<{ identity?: VerifiedIdentity; status: number; error?: string }> {
  const config = pinmeConfig(env);
  if (!config) return { status: 503, error: 'Auth service is not configured' };
  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/api/v1/auth/verify_token?project_name=${encodeURIComponent(config.projectName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
        body: JSON.stringify({ id_token: idToken }),
      },
    );
  } catch {
    return { status: 503, error: 'Auth service is unavailable' };
  }
  const result = await response.json() as PinmeEnvelope<{
    uid?: string;
    email?: string;
    display_name?: string;
    claims?: Record<string, unknown>;
    error?: string;
  }>;
  if (!response.ok || result.code !== 200 || !result.data?.uid) {
    return { status: response.status, error: result.data?.error ?? result.msg ?? 'Invalid token' };
  }
  return {
    status: 200,
    identity: {
      uid: result.data.uid,
      provider: 'pinme',
      email: result.data.email,
      displayName: result.data.display_name,
      claims: { ...(result.data.claims ?? {}), authProvider: 'pinme' },
    },
  };
}

export async function callPinmeLlm(
  env: PinmeEnv,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  options: PinmeLlmOptions = {},
): Promise<{ content?: string; error?: string }> {
  const config = pinmeConfig(env);
  if (!config) return { error: 'LLM service is not configured' };
  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(config.projectName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
        signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
        body: JSON.stringify({
          model: options.model?.trim() || env.LLM_MODEL?.trim() || 'openai/gpt-4o-mini',
          temperature: 0.2,
          stream: false,
          response_format: { type: 'json_object' },
          messages,
        }),
      },
    );
  } catch {
    return { error: 'LLM network error' };
  }
  if (!response.ok) return { error: await extractPinmeError(response) };
  try {
    // PinMe normally returns OpenRouter JSON for stream=false, but older proxy
    // deployments can still respond with SSE. Read once and support both forms.
    const content = parseChatCompletionBody(await response.text());
    return content ? { content } : { error: 'LLM returned an empty response' };
  } catch {
    return { error: 'LLM response read error' };
  }
}

export async function sendPinmeEmail(
  env: PinmeEnv,
  input: { to: string; subject: string; html: string },
): Promise<{ ok: boolean; error?: string }> {
  const config = pinmeConfig(env);
  if (!config) return { ok: false, error: 'Email service is not configured' };
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/v4/send_email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: 'Email network error' };
  }
  const result = await response.json() as PinmeEnvelope<{ ok?: boolean; error?: string }>;
  if (!response.ok || result.code !== 200) {
    return { ok: false, error: result.data?.error ?? result.msg ?? 'Email delivery failed' };
  }
  return { ok: true };
}
