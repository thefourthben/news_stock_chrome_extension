---
name: zhanla-cli
description: Teach agents how to use the Zhanla CLI (`zhanla`) to authenticate, run local Python or TypeScript components, start managed web evals, structure datasets, and debug discovery or execution issues.
---

# Zhanla CLI

Use this skill when a user wants to run Zhanla components from the terminal, connect datasets to evals, list web resources, or debug CLI behavior.

## Quick start

Install the CLI:

```bash
pip install zhanla
```

The CLI requires Python `>=3.10`.
Use `pip install --upgrade zhanla` when updating an existing project. Check the installed version with:

```bash
zhanla --version
zhanla status
```

Install the matching SDK only when the user wants local component execution:

```bash
# Python components
pip install zhanla-sdk-py

# TypeScript components
npm install @zhanla/sdk-ts
```

Use `pip install --upgrade zhanla-sdk-py` and `npm install @zhanla/sdk-ts@latest` when updating SDKs in an existing project.

Authenticate before commands that talk to the web backend:

```bash
zhanla login
zhanla logout
```

`zhanla login` prompts for an SDK API key in `bm_kid_XXXX.bm_sec_XXXX` format. Credentials are stored repo-locally at `.zhanla/credentials.json`; they are not global machine credentials. The CLI also stores update-check state in `.zhanla/version_cache.json`.

## Environment

`.env.local` is loaded automatically from the current directory or a parent directory so local components can read provider API keys.

Set `ZHANLA_BASE_URL` only when targeting a non-production app:

```bash
export ZHANLA_BASE_URL=http://localhost:3001
```

For local managed-run testing against a local app, also run the Trigger worker from the repo root:

```bash
pnpm trigger:dev
```

## Run modes

`zhanla run` requires exactly one component source, one dataset source, and one eval source.

### Local component + local eval

```bash
zhanla run components.py:priority-tool --dataset tickets.json --eval evals.py:priority-eval
zhanla run components.ts:support-agent --dataset tickets.json --eval evals.ts:support-eval
```

Use `--dry-run` to execute locally and skip upload:

```bash
zhanla run components.py:priority-tool --dataset tickets.json --eval evals.py:priority-eval --dry-run
```

Without `--dry-run`, the component still runs locally, then definitions and results are uploaded and the authoritative autorater pass runs remotely after sync.

### Local component + web autorater

```bash
zhanla run components.py:priority-tool --dataset tickets.json --web-eval autorater-key
```

This runs the local component over the dataset, uploads rows and outputs, starts a managed evaluate-only run for the autorater, and polls until completion or failure.

### Fully web-backed run

```bash
zhanla run --web-config component-key --web-dataset dataset-key --web-eval autorater-key
```

Optional model override:

```bash
zhanla run \
  --web-config component-key \
  --web-dataset dataset-key \
  --web-eval autorater-key \
  --model-endpoint openai:gpt-4.1-mini
```

Current limitation: fully managed `--web-config` runs cannot execute orchestration steps stored as `component_ref` nodes. In that case the CLI should fail clearly with an unsupported-step message; use local component execution plus `--web-eval` or a local eval until managed component-ref execution ships.

## Valid flag combinations

- `--web-config` requires `--web-dataset` and `--web-eval`.
- `--model-endpoint` only works with `--web-config`.
- `--dry-run` cannot be combined with `--web-config` or `--web-eval`.
- Local component and local eval files must use the same language.
- `Skill` components are prompt-only configuration and cannot be run directly.

## Target syntax

Use `file.py[:component-key]` for Python and `file.ts[:component-key]` for TypeScript. The suffix is the component's explicit `key`, not the Python variable name, TypeScript export name, or display `name`.

If a file contains exactly one matching runnable component or eval, the suffix is optional. If it contains multiple runnable components or evals, name the target explicitly:

```bash
zhanla run workflow.py:support-pipeline --dataset tickets.json --eval evals.py:answer-quality
zhanla run workflow.ts:support-pipeline --dataset tickets.json --eval evals.ts:answer-quality
```

If a target accidentally uses a display name, the CLI should reject it and suggest the matching key.

## Dataset formats

JSON datasets should be a top-level array. The preferred shape is optional leading metadata rows followed by data rows:

```json
[
  {
    "_schema": {
      "message": { "type": "string" },
      "expected_output": { "type": "object" }
    }
  },
  {
    "_config": {
      "name": "support tickets",
      "description": "Priority classification cases"
    }
  },
  {
    "message": "Reset my password",
    "expected_output": { "priority": "normal" }
  }
]
```

CSV is also supported:

```csv
message,expected_output
Reset my password,normal
```

Notes:

- Leading `_schema` and `_config` rows are metadata and are not executed.
- Legacy object-shaped JSON datasets with `schema` and `rows` are still accepted.
- CSV values are loaded as strings.
- Empty datasets fail fast with `Dataset is empty.`

## List commands

Use these after login:

```bash
zhanla list datasets
zhanla list autoraters
```

Useful filters:

```bash
zhanla list datasets --component-type tool --name support
zhanla list datasets --component-id component-uuid
zhanla list autoraters --component-type agent --name quality
zhanla list autoraters --component-id component-uuid
```

Supported `--component-type` values are `agent`, `skill`, `tool`, and `orchestration`.

## Local execution semantics

- Python discovery imports the file and scans module-level `zhanla` component instances.
- TypeScript discovery uses the SDK helper binary through `npx --no-install zhanla-sdk-ts`; users should still invoke the main `zhanla` CLI.
- TypeScript components must be exported, but CLI target suffixes are component `key` values.
- Files execute during discovery, so avoid expensive module-level side effects.
- Local imports from the same directory are supported.
- `Tool` runs local code and wraps non-object output as `{"result": value}`.
- `Agent`, `LLMProcessor`, and `LLMEval` require `model` plus `client` or `runner` for local execution.
- `Orchestration` executes its DAG locally and returns the final executed step output.
- `Checklist` and `EvalTree` run child evals and aggregate scores.

## Eval input contract

Local `CodeEval` functions receive canonical text fields:

- `model_input`: serialized dataset row, or the row's `input` field when present
- `model_response`: serialized component output
- `expected_output`: serialized row `expected_output`, row `output`, or the full row

Local TypeScript `CodeEval` functions receive one kwargs object:

```ts
fn: ({ model_response, expected_output }) => ({ score: 1.0 })
```

Local Python `CodeEval` functions receive those same names as kwargs:

```python
def score(model_response, expected_output=None, model_input=None, **_):
    return {"score": 1.0}
```

`model_response_format` / `modelResponseFormat` is synced with eval definitions for platform compatibility:

- `CodeEval` defaults to `"JSON"`.
- Use `"TEXT"` for evals that intentionally score raw text.
- Use `"YAML"` for YAML-shaped responses.
- Current local and eval-only execution still passes text strings to the eval function, so parse structured strings inside the eval body.
- `LLMEval` receives text input.

## Debugging checklist

1. Confirm the user is running `zhanla`, not an old command name.
2. Run `zhanla --version` and upgrade if the CLI is stale.
3. Confirm the local SDK is installed for the component language.
4. Confirm CLI target suffixes use component keys.
5. Confirm Python components are module-level objects and TypeScript components are exported.
6. Confirm every SDK component has a stable lowercase hyphenated `key`.
7. Confirm the selected component is runnable; do not target `Skill`.
8. Confirm local component and local eval files use the same language.
9. Confirm `Tool` has `fn`, `input_schema`/`inputSchema`, and `output_schema`/`outputSchema`.
10. Confirm prompt-backed components have `model` and either `client` or `runner`, but not both.
11. Check `.zhanla/credentials.json` for login state and `ZHANLA_BASE_URL` for environment mismatches.
