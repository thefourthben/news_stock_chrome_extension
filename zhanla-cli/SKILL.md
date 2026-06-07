---
name: zhanla-cli
description: Teach agents how to use the Zhanla CLI (`zhanla`) to authenticate, run local Python or TypeScript components, start managed web evals, structure datasets, and debug discovery or execution issues.
---

# Zhanla CLI

Use this skill when a user wants to run Zhanla components from the terminal, wire datasets and evals together, or debug CLI behavior.

## Important naming note

Prefer the `zhanla` command in examples and instructions.

## Quick start

Install the CLI:

```bash
pip install zhanla
```

Install the matching local SDK only if the user wants local component execution:

```bash
# Python components
pip install zhanla-sdk-py

# TypeScript components
npm install @zhanla/sdk-ts
```

Authenticate before any command that talks to the web backend:

```bash
zhanla login
zhanla logout
```

Credentials are stored **repo-locally** at `.zhanla/credentials.json` in the current git repo root. They are not global machine credentials — each repo has its own login.

## Core run patterns

Run a local component against a local eval:

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval
```

Run a local component and score it with a managed autorater:

```bash
zhanla run components.py:my-tool --dataset data.json --web-eval autorater-key
```

Run entirely against web-managed prompt, dataset, and autorater resources:

```bash
zhanla run --web-config component-key --web-dataset dataset-key --web-eval autorater-key
```

Use `--dry-run` to execute locally without uploading (good for testing):

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval --dry-run
```

Skip the confirmation prompt with `--yes` (required for CI/CD):

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval --dry-run --yes
```

Limit to the first N rows for a quick sanity check:

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval --dry-run --yes --max-rows 3
```

Write machine-readable per-item results to a file:

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval --output results.json
```

Exit non-zero if any row errors (useful in CI):

```bash
zhanla run components.py:my-tool --dataset data.json --eval evals.py:my-eval --fail-on-row-error
```

## Hard rules

- `zhanla run` requires exactly one component source.
- It also requires exactly one dataset source and exactly one eval source.
- `--web-config` only works with `--web-dataset` and `--web-eval`.
- `--model-endpoint` only works with `--web-config`.
- `--dry-run` cannot be combined with `--web-eval` or `--web-config`.
- Local component and eval files must use the same language.
- `Skill` components are not runnable top-level CLI targets.

## Target syntax

Use `file.py[:key]` for Python or `file.ts[:key]` for TypeScript. The `:key` is the component's stable `key` field (lowercase hyphenated), not the variable name or display name.

If a file has exactly one runnable component, `:key` is optional.

Examples:

```bash
zhanla run workflow.py:support-pipeline --dataset tickets.json --eval evals.py:answer-quality
zhanla run workflow.ts:support-pipeline --dataset tickets.json --eval evals.ts:answer-quality
```

## Dataset formats

Preferred JSON shape:

```json
[
  {
    "_schema": {
      "message": { "type": "string" },
      "expected_output": { "type": "string" }
    }
  },
  {
    "message": "Reset my password",
    "expected_output": "support"
  }
]
```

CSV is also supported:

```csv
message,expected_output
Reset my password,support
```

Notes:

- Leading `_schema` and `_config` rows are metadata and are not executed.
- CSV values are loaded as strings.
- Empty datasets fail fast.

## List commands

Use these after login:

```bash
zhanla list datasets
zhanla list autoraters
```

Useful filters:

```bash
zhanla list datasets --component-type tool --name support
zhanla list autoraters --component-id component-uuid
```

## What the CLI expects from local code

- Python discovery imports the file and scans module-level component instances.
- TypeScript discovery shells out to `npx --no-install zhanla-sdk-ts discover <spec>`.
- TypeScript local execution requires `@zhanla/sdk-ts` to already be installed in the current project.
- `.env.local` is loaded automatically from the current directory or a parent directory.
- For Google Gemini, the CLI accepts either `GOOGLE_API_KEY` or `GEMINI_API_KEY` — whichever is set.

## Eval behavior that matters in practice

- Both Python and TypeScript `CodeEval` functions receive a **single kwargs object** — not positional arguments.
- The field names are snake_case: `model_response` (required), `expected_output`, `model_input`.
- `model_response` is always a string. Parse JSON inside the eval body when you need a structured value.
- `CodeEval` defaults to `model_response_format="JSON"` unless set to `"TEXT"` or `"YAML"`.
- `LLMEval` is runner-backed and expects prompt-style execution with `model` and `runner` or `client`.

TypeScript CodeEval:

```ts
fn: ({ model_response, expected_output }) => {
  const output = JSON.parse(model_response);
  const expected = expected_output ? JSON.parse(expected_output) : {};
  return { score: output.sentiment === expected.sentiment ? 1.0 : 0.0 };
}
```

Python CodeEval:

```python
def score(model_response, expected_output=None, **_):
    import json
    output = json.loads(model_response)
    expected = json.loads(expected_output or "{}")
    return {"score": 1.0 if output.get("sentiment") == expected.get("sentiment") else 0.0}
```

## Debugging

When something goes wrong, read the relevant files and fix the issue directly. Only ask the user when you cannot act (e.g., a missing API key you don't have access to).

**Discovery fails / "no components found"** — read the component file. For Python, move the component to module scope if it's inside a function. For TypeScript, add `export` to the component declaration.

**"Matched a component name"** — read the file, find the `key:` field on the target component, and use that value in the CLI command instead.

**SDK not installed** — run `pip install zhanla-sdk-py` for Python components or `npm install @zhanla/sdk-ts` for TypeScript components, then retry.

**Language mismatch error** — the component file and eval file must have the same extension (`.py`/`.py` or `.ts`/`.ts`). Either find the matching eval file or create one in the correct language.

**`Skill` cannot be run** — read the file, identify the `Skill` component, and find the `Agent` or `Orchestration` that uses it. Use that as the CLI target instead.

**Wrong flag combination** — recheck: `--web-config` requires both `--web-dataset` and `--web-eval`; `--dry-run` cannot be combined with `--web-eval`; local component and local eval must be the same language.
