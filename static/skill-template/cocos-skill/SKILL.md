---
name: cocos-skill
description: Use when working in a Cocos Creator project that has the cocos-skill extension installed and you need to inspect or modify scenes, nodes, components, assets, project settings, or editor state through the local HTTP API.
---

<!-- cocos-skill:managed-body:start -->
# Cocos Skill

Use this skill to drive a live Cocos Creator editor through the local `cocos-skill` HTTP server.

## When to Use

- The project contains `.cocos-skill-config.json` and the extension is expected to be running.
- You need live editor state, scene graph reads, node/component mutations, asset-db operations, or editor message routing.
- You need post-change verification against the live editor, not just filesystem edits.

Do not use this skill when:

- Plain code or text-file edits are enough and no editor state is involved.
- The extension is not available and there is no reachable `baseUrl`.

## Connection Checklist

1. Read `${projectRoot}/.cocos-skill-config.json`.
2. Use `baseUrl` directly, or derive `http://127.0.0.1:{port}/skill` from `port`.
3. Verify the server with `GET {baseUrl}/health`.
4. Prefer `POST` JSON requests for tool endpoints unless a read-only `GET` is explicitly documented.
5. Re-read editor state after every mutation.

## Default Operating Pattern

1. `POST /skill/context` to inspect the current scene, selection, dirty state, and hierarchy.
2. `POST /skill/search-nodes` or query assets/components to locate the real live target.
3. Before property writes, call definitions first:
   - `POST /skill/definitions/nodes`
   - `POST /skill/definitions/components`
4. Prefer high-level tools over raw editor messages:
   - `create_nodes`
   - `modify_nodes`
   - `modify_components`
   - `operate_current_scene`
   - `operate_assets`
5. Use `editor_request` only for Editor.Message commands not covered by high-level tools.
6. Verify with `context`, `search_nodes`, `query_nodes`, `query_components`, or asset queries.

## Primary Endpoints

| Need | Endpoint | Notes |
|------|----------|-------|
| Health | `GET /skill/health` | Confirm the server is reachable before any workflow |
| Tool discovery | `GET /skill/tools` | Inspect registered high-level tools |
| Editor context | `POST /skill/context` | Best first read in most workflows |
| Node search | `POST /skill/search-nodes` | Prefer re-searching live nodes over stale UUIDs |
| Generic tool call | `POST /skill/tool/:toolName` | Use when the route-specific endpoint is not convenient |
| Low-level editor message | `POST /skill/editor-request` | Fallback path for uncovered commands |
| Destructive approval flow | `POST /skill/apply-gated-action` | Required for gated operations |

## Task Routing

| Task | Start Here | Next Reference |
|------|------------|----------------|
| Choose the right workflow quickly | `context` | `references/00-workflows.md` |
| Inspect hierarchy or query nodes | `context`, `search_nodes`, `query_nodes` | `references/01-node-query.md` |
| Create, delete, copy, move, or re-parent nodes | `create_nodes`, `modify_nodes` | `references/02-node-lifecycle.md` |
| Change position, scale, color, text, or property paths | definitions -> modify tools | `references/03-node-properties.md` |
| Add, remove, or inspect components | `query_components`, `modify_components` | `references/04-component-operations.md` |
| Query assets, UUIDs, dependencies, or usages | `operate_assets`, `editor_request` | `references/05-asset-query.md` |
| Create, save, move, copy, refresh, or import assets | `operate_assets`, `editor_request` | `references/06-asset-crud.md` |
| Open, save, close, or snapshot scenes | `operate_current_scene`, `apply_gated_action` | `references/07-scene-management.md` |
| Execute scene scripts or component methods | `execute_scene_code`, `editor_request` | `references/08-script-execution.md` |
| Focus camera, switch 2D/3D, or change gizmo state | `editor_request` | `references/09-viewport-gizmo.md` |
| Select nodes/assets or edit project settings | `editor_request`, `operate_project_settings` | `references/10-selection-and-project.md` |
| Discover valid property paths and types before mutation | definitions endpoints | `references/11-definitions.md` |
| Record project-specific lessons that should survive sync | local notes block below | `references/12-experience-capture.md` |

## High-Signal Rules

- Start from live state. Do not trust stale UUIDs from old chats or earlier editor sessions.
- `POST` is the default. It preserves value types and avoids query-string coercion issues.
- Discover, then act. Use definitions before property writes to avoid hallucinated paths and dump types.
- Prefer high-level tools first. Drop to `editor_request` only when you need a specific Editor.Message command.
- For low-level `editor_request` calls, read the signature cheat sheet in the matching reference first. Do not guess command names, argument shapes, or enum values.
- Re-query before destructive actions. Confirm the current live target and expected blast radius.
- Asset writes need preflight checks. Query source and destination explicitly before `create`, `copy`, `move`, or `save`.
- Large scenes should start with `summaryOnly=true`, then narrow with `search_nodes`.
- Return UUIDs back exactly as received. The server handles UUID encoding/decoding for you.
- Always verify after mutations with a fresh readback.

## `editor_request` Guardrails

- First call `{ "listCommands": true }` when you are unsure about the channel or command name.
- Keep requests narrow: one command, minimal args, explicit verification after the call.
- Prefer the documented allowlisted channels:
  - `scene`
  - `asset-db`
  - `selection`
  - `project`
- Use the command references instead of guessing signatures.

## Gated Actions

Use `apply_gated_action` for destructive or approval-sensitive actions.

1. First call without `approvalToken` to get preview data.
2. Inspect `riskLevel`, `summary`, and the proposed params.
3. Call again with the returned `approvalToken` only when the target is confirmed.
4. Verify the result with a fresh read.

## Project Notes

Use the preserved notes block below for project-local reminders:

- live scene quirks
- node lookup gotchas
- asset import caveats
- verification commands that worked on this project

Do not put reusable general guidance there; keep that in the bundled references instead.
<!-- cocos-skill:managed-body:end -->

<!-- cocos-skill:local-notes:start -->
## Project Notes

This section is preserved during template sync.

<!-- cocos-skill:local-notes:user:start -->
- Add project-specific notes here.
<!-- cocos-skill:local-notes:user:end -->
<!-- cocos-skill:local-notes:end -->
