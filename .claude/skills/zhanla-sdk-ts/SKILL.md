---
name: zhanla-sdk-ts
description: Teach agents how to build Zhanla components with `@zhanla/sdk-ts`, export them for discovery, run them with `zhanla`, choose the right component types, and avoid current TypeScript SDK pitfalls.
---

# Zhanla TypeScript SDK

Use this skill when a user wants to create or edit Zhanla components in TypeScript.

## Quick start

Install the SDK:

```bash
npm install @zhanla/sdk-ts
```

The SDK requires Node `>=18`.
Use `npm install @zhanla/sdk-ts@latest` when updating an existing project.

Install provider SDKs only when the component uses them:

```bash
npm install @anthropic-ai/sdk
npm install openai
npm install @google/genai
```

The main runner CLI is `zhanla`. The package also ships an internal helper binary named `zhanla-sdk-ts`; user-facing workflows should run through `zhanla`.

## Authoring rules

- Export component instances at module scope. Discovery is export-based.
- Give every component a stable lowercase hyphenated `key` such as `support-agent`.
- Use full JSON Schema objects for `inputSchema` and `outputSchema`.
- `Tool.inputSchema` must be an object schema with `type: "object"` and `properties`.
- `Tool` requires `name`, `description`, `key`, `fn`, and `inputSchema`; provide `outputSchema` for CLI validation.
- `CodeEval` receives one kwargs object, not positional `(modelResponse, expectedResponse)` arguments.
- `Agent`, `LLMProcessor`, and `LLMEval` require `instructions`, `model`, and `key`.
- Prompt-backed components need `client` or `runner` for local CLI execution.
- Never pass both `client` and `runner`.
- `LLMEval` requires exactly one of `instructions` or `questions`.

## Minimal runnable pattern

```ts
import { CodeEval, Tool } from "@zhanla/sdk-ts";

export const priorityTool = new Tool({
  name: "priority_tool",
  description: "Classify support ticket priority.",
  key: "priority-tool",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      customerTier: { type: "string" },
    },
    required: ["message"],
  },
  fn: (kwargs) => {
    const { message, customerTier } = kwargs as {
      message?: string;
      customerTier?: string;
    };
    const urgent = message?.toLowerCase().includes("urgent") || customerTier === "enterprise";
    return { priority: urgent ? "high" : "normal" };
  },
  outputSchema: {
    type: "object",
    properties: {
      priority: { type: "string" },
    },
    required: ["priority"],
  },
});

export const priorityEval = new CodeEval({
  name: "priority_eval",
  description: "Check predicted priority.",
  key: "priority-eval",
  fn: ({ model_response, expected_output }) => {
    const response = model_response ? JSON.parse(model_response) : {};
    const expected = expected_output ? JSON.parse(expected_output) : {};
    return {
      score: response.priority === expected.priority ? 1.0 : 0.0,
    };
  },
});
```

Run it with:

```bash
zhanla run components.ts:priority-tool --dataset tickets.json --eval components.ts:priority-eval
```

## Prompt-backed component pattern

Use `client` for normal provider-backed execution:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "@zhanla/sdk-ts";

export const supportAgent = new Agent({
  name: "support_agent",
  description: "Respond to support requests.",
  key: "support-agent",
  instructions: 'Answer clearly. Return JSON: {"answer": "..."}',
  model: "claude-sonnet-4-6",
  client: new Anthropic(),
  outputSchema: {
    type: "object",
    properties: {
      answer: { type: "string" },
    },
    required: ["answer"],
  },
  jsonRepair: true,
});
```

Use an explicit `Runner` when you need to share or customize runner behavior:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Runner } from "@zhanla/sdk-ts";

const runner = new Runner({ client: new Anthropic() });
```

## Which component to use

- `Tool`: deterministic TypeScript logic. Local execution calls `fn(kwargs)`.
- `Skill`: reusable prompt instructions; not executable as a top-level CLI target.
- `Agent`: LLM-backed component with optional tools, skills, and nested agents.
- `LLMProcessor`: one prompt-defined transformation step.
- `Orchestration`: DAG of steps.
- `CodeEval`: deterministic scoring logic. Local execution calls `fn(kwargs)`.
- `LLMEval`: prompt-backed evaluator.
- `Checklist`: weighted combination of evals.
- `EvalTree`: score-threshold branching across evals.

## CodeEval

`CodeEval` functions receive a **single kwargs object** — not positional arguments. The fields are snake_case:

```ts
type CodeEvalKwargs = {
  model_response: string;   // required — the component's output
  expected_output?: string; // optional — the dataset row's expected value
  model_input?: string;     // optional — the serialized dataset row input
};
```

**Always destructure the kwargs object:**

```ts
fn: ({ model_response, expected_output }) => { ... }  // correct
```

**Never declare two positional parameters — TypeScript will not catch this error:**

```ts
fn: (modelResponse, expectedResponse) => { ... }  // WRONG: silent failure
// At runtime, modelResponse receives the whole kwargs object.
// expectedResponse is always undefined.
// Scores will be wrong with no compile error or warning.
```

The fields are snake_case (`model_response`, `expected_output`, `model_input`), not camelCase. Using `kwargs.modelResponse` also fails silently for the same reason.

Return an object such as `{ score: 1.0 }`. Non-object returns are wrapped as `{ score: value }`.

Set `modelResponseFormat` to sync the intended response format with eval definitions. Current local and eval-only execution still passes text strings to your function, so parse structured responses inside the eval body:

```ts
export const textEval = new CodeEval({
  name: "contains_label",
  description: "Check raw text for a label.",
  key: "contains-label",
  modelResponseFormat: "TEXT",
  fn: ({ model_response }) => ({
    score: model_response.toLowerCase().includes("priority") ? 1.0 : 0.0,
  }),
});
```

Supported values are `"JSON"` (default), `"TEXT"`, and `"YAML"`.

## LLMEval

Use either `instructions` or `questions`, not both:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { LLMEval } from "@zhanla/sdk-ts";

export const toneEval = new LLMEval({
  name: "tone_eval",
  description: "Evaluate tone.",
  key: "tone-eval",
  instructions: 'Return JSON: {"score": 0.0, "reason": "..."}',
  model: "claude-sonnet-4-6",
  client: new Anthropic(),
  outputSchema: {
    type: "object",
    properties: {
      score: { type: "number" },
      reason: { type: "string" },
    },
    required: ["score", "reason"],
  },
});
```

Question-based form:

```ts
export const accuracyEval = new LLMEval({
  name: "accuracy_eval",
  description: "Evaluate accuracy.",
  key: "accuracy-eval",
  questions: [
    "Is the answer factually correct?",
    "Does it omit critical details?",
  ],
  model: "claude-sonnet-4-6",
  client: new Anthropic(),
});
```

## Orchestration

Use `Step` to compose components into a DAG:

```ts
import { Orchestration, Step } from "@zhanla/sdk-ts";

export const supportPipeline = new Orchestration({
  name: "support_pipeline",
  description: "Classify priority, then respond.",
  key: "support-pipeline",
  steps: [
    new Step({ name: "classify", component: priorityTool, next: ["reply"] }),
    new Step({ name: "reply", component: supportAgent }),
  ],
});
```

Use `Conditional` for routing:

```ts
import { Conditional, Step } from "@zhanla/sdk-ts";

new Step({
  name: "route",
  component: new Conditional({
    condition: (state) => {
      const classify = state.classify as { priority?: string };
      return classify.priority === "high";
    },
    ifTrue: "urgent_reply",
    ifFalse: "normal_reply",
  }),
});
```

## Discovery and CLI usage

Only exported component instances are discoverable.

Good:

```ts
export const myTool = new Tool({ ... });
export const myAgent = new Agent({ ... });
```

Not discoverable:

```ts
const hiddenTool = new Tool({ ... });
export function makeAgent() {
  return new Agent({ ... });
}
```

Use the main CLI for end-to-end runs:

```bash
zhanla run workflow.ts:support-pipeline --dataset tickets.json --eval evals.ts:answer-quality
```

CLI target suffixes use component `key` values, not export variable names and not display `name` values. If the component has `key: "support-pipeline"`, run `workflow.ts:support-pipeline` even when the exported variable is `supportPipeline` or the display name is `"Support Pipeline"`.

The `zhanla-sdk-ts` helper binary is for the main CLI's internal discovery, run, and eval-only paths. It checks an internal token and is not a normal user command.

## Runtime behavior

- `Tool.fn` can be sync or async.
- Non-object tool return values are wrapped as `{ result: value }`.
- Runner-backed components parse JSON responses when possible.
- If parsing fails, plain text is wrapped as `{ result: text }`.
- `outputSchema` is used for local validation.
- Tool calls are exposed on output as `_toolCalls`.
- `jsonRepair`, `temperature`, and `topK` can be set on prompt-backed components.

## Observability

Use `wrap(client)` when calling a provider client directly outside a runner-backed component:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { wrap } from "@zhanla/sdk-ts";

const client = wrap(new Anthropic());
```

Supported clients include Anthropic, OpenAI, OpenRouter through an OpenAI-compatible `baseURL`, and Google GenAI. `Runner` wraps its client internally, so do not wrap the same client first.

Use `parseJsonResponse(text)` to parse bare JSON or fenced JSON from model output.

## Common gotchas

1. Use `zhanla` for normal end-to-end runs.
2. Components must be exported for discovery.
3. CLI target suffixes use the component `key` property, not the exported variable name or display `name`.
4. Every component needs an explicit valid `key`.
5. `Skill` is prompt-only and cannot be run directly.
6. Local TypeScript runs need the eval file to be TypeScript too.
7. `Tool.inputSchema` must be a JSON Schema object with `type: "object"` and `properties`.
8. `CodeEval.fn` must destructure a single kwargs object: `fn: ({ model_response, expected_output }) => ...`. Writing two positional params like `fn: (modelResponse, expectedResponse) => ...` compiles without error but `modelResponse` silently receives the whole object and `expectedResponse` is always `undefined`.
9. `LLMEval` raises during construction unless exactly one of `instructions` or `questions` is supplied.
