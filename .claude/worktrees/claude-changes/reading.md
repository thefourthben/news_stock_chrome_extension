# Step-Centric Workflow Hardening Plan

  ## Summary

  Refactor the workflow concept so a workflow is only a lightweight grouping of ordered steps plus a “when to use” instruction. All
  operational detail lives on steps: prompts, widgets, tools, markers, actions, artifact handling, and final creation actions. The
  runtime stays simple: pass step capabilities into the prompt, then handle model markers through deterministic post-processing.

  ## Key Changes

  - Keep WorkflowDefinition minimal:
      - Fields: name, triggerDescription, steps.
      - triggerDescription is the god-agent “when to use” instruction.
      - steps is an ordered list of step references plus optional per-step config.
      - Remove workflow-level widgets, actions, tools, and materialization concepts.

  - Make StepDefinition the real extension point:
      - Each step declares its prompt, completion check, widgets, actions, tools, and optional config shape.
      - Pass steps[].config into StepContext.
      - Rename or remove misleading fields if they are not executable, especially skills.
      - Add a step-level actions registry for deterministic operations like “proceed,” “select recommendation,” “run quality check,”
        or “create final resource.”

  - Use step registries to build prompts:
      - The active step prompt includes available widget markers and action markers.
      - Example: the step prompt can tell the model to emit <suggest_transition /> or <workflow_action name="select_recommendation" /
        >.
      - Keep prompts descriptive; the model only suggests markers, while code performs all real effects.

  - Centralize response post-processing:
      - Add one post-processor for child workflow responses.
      - It strips known markers from assistant text.
      - Widget markers become normalized message payloads.
      - Action markers dispatch to the active step’s registered actions.
      - Unknown markers are stripped or ignored with logging.

  - Replace autorater-specific workflow actions with step actions:
      - Move proceed_to_recommendations onto the context collection or recommendation step.
      - Move select_recommendation onto the recommendation step.
      - Treat final creation as a step action on the final step, not as a workflow-level hook.
      - Keep existing autorater and dataset DB writes, but call them through step actions where practical.

  - Make widget rendering registry-driven:
      - Register existing widgets like component_selector, transition_card, and recommendation_cards.
      - Replace hard-coded chat rendering branches with widget registry lookup.
      - Future devs add widgets by registering key, renderer, and payload expectations.

  - Update developer docs and template:
      - Provide a small example workflow where the workflow only groups steps.
      - Provide a step template showing prompt, widgets, actions, artifact writes, completion logic, and tests.
      - Document that complex behavior belongs in steps, not workflows.
      - Keep manual plugins documented as legacy/escape hatch only.

  ## Test Plan

  - Add workflow tests proving registration, god-agent prompt inclusion, launch enum inclusion, and ordered active-step resolution.
  - Add step tests for config passing, completion checks, action lookup, duplicate action/widget names, and prompt capability
    sections.

  - Add post-processing tests for widget markers, action markers, unknown markers, and cleaned assistant text.
  - Add action dispatcher tests proving step actions can write artifacts, update status, and add parent/child messages.
  - Add regression tests for autorater creation and dataset generation so existing flows still launch, route, act, and create final
    resources.

  - Add a tiny sample workflow test that completes using only registered steps and step actions, with no manual plugin.

  ## Assumptions
  - Widgets, tools, actions, and final creation behavior belong to steps.
  - “Materialization” means final creation of a real resource from workflow artifacts; in this architecture it is implemented as a
    final-step action.

  - No new database table is needed.
  - Existing draft-session persistence remains the source of truth.