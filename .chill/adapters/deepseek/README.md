# DeepSeek Adapter

DeepSeek can run Chill Workflow in two ways:

1. Configure an agent tool to use DeepSeek as its backend model.
2. Use the API runner in this folder to send Chill instructions directly.

The direct API mode is useful for learning, but it does not edit files by itself unless you build file tools around it.

## Environment

```bash
export DEEPSEEK_API_KEY="..."
```

## Run

```bash
node .chill/adapters/deepseek/deepseek-chill-runner.mjs ./docs/prd.md .
```
