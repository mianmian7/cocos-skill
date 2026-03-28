# 00 — Task-First Workflows

Use this file when you already know the goal, but you need the shortest safe path through the available tools.

## Inspect Live Editor State

1. `POST /skill/context`
2. If the scene is large, use:
   - `summaryOnly=true`
   - smaller `maxDepth`
   - smaller `maxNodes`
3. If you need a specific target, switch to `search_nodes` or `query_nodes`.
4. Re-run `context` or a narrower query after changes.

## Edit Nodes Or Components

1. Find the live target with `search_nodes` or `query_nodes`.
2. Call definitions before writes:
   - `POST /skill/definitions/nodes`
   - `POST /skill/definitions/components`
3. Apply the change with:
   - `modify_nodes`
   - `modify_components`
4. Verify with a fresh `query_nodes`, `query_components`, or `context`.

## Open, Save, Or Switch Scenes

1. Read current state with `context` or `query-dirty`.
2. Save first if the current scene is dirty.
3. Open or close the scene with the high-level scene tool, or use the documented `scene` commands.
4. Verify the active scene and dirty state again.

## Query Or Change Assets

1. Preflight query both source and destination.
2. Decide explicitly whether the operation should:
   - fail
   - overwrite
   - rename
3. Perform the asset action.
4. Refresh or re-query the asset-db result after the change.

## Use `editor_request`

Use `editor_request` only when a high-level tool does not cover the operation.

Recommended order:

1. `POST /skill/editor-request` with `{ "listCommands": true }` if command names are uncertain.
2. Read the matching reference file for the command family.
3. Send one narrow command.
4. Verify with a separate read command.

## Use Gated Actions

For destructive or approval-sensitive changes:

1. Call `apply_gated_action` without `approvalToken`.
2. Inspect the preview result.
3. Re-run with `approvalToken`.
4. Confirm the live outcome.

## Record Project-Specific Lessons

When you discover a rule that only matters to this project:

1. Write it in the preserved `Project Notes` block in `SKILL.md`.
2. Keep it short and verifiable.
3. Use the schema from `references/12-experience-capture.md`.
