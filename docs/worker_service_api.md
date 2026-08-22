# Worker Service API Documentation

This document covers only the public API endpoints that Workers need to call directly.

Current endpoints:

- `POST /api/v4/send_email`
- `POST /api/v1/chat/completions`

## 1. Overview

These endpoints are designed for internal calls from Workers or server-side code. They do not use JWT authentication but instead rely on project-level API Keys.

### Authentication

- Use the `X-API-Key` request header
- The `X-API-Key` is returned by `pinme create`
- `/api/v1/chat/completions` additionally requires a `project_name` query parameter
- The `X-API-Key` must correspond to the same project as `project_name`

### Response Format

On success, returns a unified JSON wrapper:

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "ok": true
  }
}
```

## 2. POST /api/v4/send_email

### Description

Send an email using the project API Key.

### Request Headers

| Header | Required | Description |
| --- | --- | --- |
| `X-API-Key` | Yes | Project API Key |
| `Content-Type: application/json` | Recommended | Request body is JSON |

### Request Body

```json
{
  "to": "user@example.com",
  "subject": "Your verification code",
  "html": "<p>Your code is <strong>123456</strong></p>"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `to` | string | Yes | Recipient email address |
| `subject` | string | Yes | Email subject |
| `html` | string | Yes | Email HTML content |

### Validation Rules

- Maximum request body size is 1MB
- `to` is validated for basic email format
- `subject` must not be empty
- `html` must not be empty

### Success Response

HTTP `200 OK`

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "ok": true
  }
}
```

### Error Responses

Errors are returned using the unified wrapper format.

| Scenario | HTTP Status | `code` | `msg` | `data.error` |
| --- | --- | --- | --- | --- |
| Missing `X-API-Key` | 401 | 500 | `fail` | `X-API-Key header is required` |
| Invalid API Key | 401 | 500 | `fail` | `Invalid API key` |
| Invalid JSON | 400 | 400 | `invalid param` | `Invalid JSON` |
| Invalid email format | 400 | 400 | `invalid param` | `Invalid email address` |
| Empty `subject` | 400 | 400 | `invalid param` | `Subject is required` |
| Empty `html` | 400 | 400 | `invalid param` | `HTML content is required` |
| Send failure | 500 | 500 | `fail` | `Failed to send email` |

### TypeScript Example

```ts
interface Env {
  API_KEY: string
  BASE_URL?: string
}

type SendEmailResponse = {
  code: number
  msg: string
  data?: {
    ok?: boolean
    error?: string
  }
}

async function sendEmail(env: Env) {
  const baseUrl = env.BASE_URL ?? "https://pinme.dev"

  const response = await fetch(`${baseUrl}/api/v4/send_email`, {
    method: "POST",
    headers: {
      "X-API-Key": env.API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "user@example.com",
      subject: "Your verification code",
      html: "<p>Your code is <strong>123456</strong></p>",
    }),
  })

  const result = (await response.json()) as SendEmailResponse

  if (!response.ok) {
    throw new Error(result.data?.error ?? "send_email request failed")
  }

  return result
}
```

## 3. POST /api/v1/chat/completions

### Description

This endpoint proxies chat completion requests on the server side.

### Request Headers

| Header | Required | Description |
| --- | --- | --- |
| `X-API-Key` | Yes | Project API Key |
| `Content-Type: application/json` | Recommended | Request body is JSON |

### Query Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `project_name` | string | Yes | Project name, must match the `X-API-Key` |

### Request Body

The request body is forwarded as JSON. Callers should provide a valid chat completion request. For example:

```json
{
  "model": "your-model-name",
  "messages": [
    {
      "role": "user",
      "content": "Say hello in one sentence."
    }
  ]
}
```

Streaming requests are also supported:

```json
{
  "model": "your-model-name",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "Count from 1 to 5."
    }
  ]
}
```

### Success Response

- Non-streaming requests: Returns a standard JSON response
- Streaming requests: Returns `text/event-stream`

### Error Responses

When local validation fails, errors are returned using the unified wrapper format.

| Scenario | HTTP Status | `code` | `msg` | `data.error` |
| --- | --- | --- | --- | --- |
| Missing `X-API-Key` | 401 | 500 | `fail` | `X-API-Key header is required` |
| Missing `project_name` | 400 | 400 | `invalid param` | `project_name is required` |
| API Key and project name mismatch | 401 | 500 | `fail` | `Invalid API key or project name` |
| Request body exceeds 1MB or read failure | 413 | 500 | `fail` | `Request body too large (max 1MB)` |

### TypeScript Example

```ts
interface Env {
  API_KEY: string
  PROJECT_NAME: string
  BASE_URL?: string
}

async function createChatCompletion(
  env: Env
) {
  const baseUrl = env.BASE_URL ?? "https://pinme.dev"

  const response = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: "POST",
      headers: {
        "X-API-Key": env.API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "your-model-name",
        messages: [
          {
            role: "user",
            content: "Say hello in one sentence.",
          },
        ],
      }),
    }
  )

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return await response.json()
}
```

## 4. Caller Notes

- All requests must include the `X-API-Key` header
- `chat/completions` additionally requires the `project_name` query parameter
- `send_email` returns a unified JSON wrapper on success
- `chat/completions` success responses may be either standard JSON or a streaming response
- Keep request body size under 1MB
