# Cocos Creator AI Skill

cocos-skill is a Cocos Creator extension that runs an in-editor HTTP tool server for AI-assisted game development.

## What It Provides

- HTTP API under `/skill/*` for scene, asset, and project operations
- 19 registered tools reused from `source/skill/tools/`
- Auto-start support and persisted server config in `Editor.Profile` (`cocos-skill.server-config`)
- Project-root discovery file: `.cocos-skill-config.json` (contains `port` and `baseUrl`)
- Skill-directory bootstrap on extension load:
  - `.claude/skills/`
  - `.codex/skills/`
  - `.agent/skills/`
- Auto-sync bundled skill template on extension load:
  - `.claude/skills/cocos-skill/SKILL.md`
  - `.codex/skills/cocos-skill/SKILL.md`
  - `.agent/skills/cocos-skill/SKILL.md`
  - Updates the managed `SKILL.md` body while preserving the project-local `Project Notes` block
  - Refreshes bundled `references/*` and other template files when the source changes
  - Template source is bundled in release: `static/skill-template/cocos-skill/`

## What It Does Not Generate

- No legacy protocol config file
- No bundled Python CLI script in this repository
- No external installer required for skill template bootstrap

## Skill Template Maintenance Sources

- This section exists for maintaining `static/skill-template/cocos-skill/`; it is not synced into the packaged skill content.
- The repo-root `@cocos/` directory is currently a local reference copy. It is ignored by `.gitignore`, and `npm run package` does not include it in the release zip.

| Template topic | Verified maintenance sources |
|---|---|
| `references/01` `02` `03` `04` `07` `08` `09` | `@cocos/creator-types/editor/packages/scene/@types/message.d.ts`; also `@cocos/creator-types/editor/packages/scene/@types/public.d.ts` when option or dump shapes matter |
| `references/05` `06` | `@cocos/creator-types/editor/packages/asset-db/@types/message.d.ts`; also `@cocos/creator-types/editor/packages/asset-db/@types/public.d.ts` for `QueryAssetsOption`, `AssetOperationOption`, and `IAssetInfo` |
| `references/10` | `selection` comes from `Editor.Selection` in `@cocos/creator-types/editor/editor.d.ts`; `project` uses `@cocos/creator-types/editor/packages/project/@types/message.d.ts` and `index.d.ts`; `preferences` uses `@cocos/creator-types/editor/packages/preferences/@types/message.d.ts` and `index.d.ts` |
| `references/11` | In-repo tool implementations: `source/skill/tools/get-node-definitions.ts`, `source/skill/tools/get-component-definitions.ts` |
| `editor_request` whitelist and runtime adaptation | `source/skill/tools/editor-request-schemas.ts`, `source/skill/tools/editor-request-support.ts` |

## Quick Start

1. Install the extension in Cocos Creator.
2. Wait for extension load; the HTTP server auto-starts in background (default `autoStart: true`).
3. Verify with:

```bash
PORT=$(node -p "require('./.cocos-skill-config.json').port")
curl "http://127.0.0.1:${PORT}/skill/health"
```

If port `3000` is occupied, the server retries the next ports (up to 10 attempts) and persists the final port to both `Editor.Profile` and `.cocos-skill-config.json`.

## Tool Set (19)

### Gateway (4)
- `get_editor_context`
- `search_nodes`
- `editor_request`
- `apply_gated_action`

### Discovery & Inspection (5)
- `query_nodes`
- `query_components`
- `get_available_asset_types`
- `get_available_component_types`
- `get_assets_by_type`

### Creation & Modification (3)
- `create_nodes`
- `modify_nodes`
- `modify_components`

### Asset & Project (5)
- `operate_assets`
- `operate_current_scene`
- `operate_prefab_assets`
- `node_linked_prefabs_operations`
- `operate_project_settings`

### Advanced (2)
- `operate_scripts_and_text`
- `execute_scene_code`

## HTTP API

Base URL: `http://127.0.0.1:<port>/skill`

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Server status, active port, and tool list |
| `/tools` | GET | Registered tools metadata |
| `/context` | GET/POST | Execute `get_editor_context` |
| `/search-nodes` | POST | Execute `search_nodes` |
| `/query-nodes` | POST | Execute `query_nodes` |
| `/create-nodes` | POST | Execute `create_nodes` |
| `/modify-nodes` | POST | Execute `modify_nodes` |
| `/query-components` | POST | Execute `query_components` |
| `/modify-components` | POST | Execute `modify_components` |
| `/current-scene` | POST | Execute `operate_current_scene` |
| `/assets` | POST | Execute `operate_assets` |
| `/prefab-assets` | POST | Execute `operate_prefab_assets` |
| `/node-prefab` | POST | Execute `node_linked_prefabs_operations` |
| `/discovery/components` | GET | Execute `get_available_component_types` |
| `/discovery/assets` | GET | Execute `get_available_asset_types` |
| `/discovery/assets-by-type` | POST | Execute `get_assets_by_type` |
| `/project-settings` | POST | Execute `operate_project_settings` |
| `/scripts-text` | POST | Execute `operate_scripts_and_text` |
| `/execute-scene` | POST | Execute `execute_scene_code` |
| `/editor-request` | POST | Execute `editor_request` |
| `/apply-gated-action` | POST | Execute `apply_gated_action` |
| `/tool/:toolName` | POST | Generic tool execution endpoint |

Example:

```bash
curl -X POST http://127.0.0.1:3000/skill/create-nodes \
  -H "Content-Type: application/json" \
  -d '{"nodes":[{"type":"Empty","name":"MyNode"}]}'
```

## Development

### Commands

```bash
npm install
npm run build
npm run build:watch
npm run build:tsc
npm run qa:skill-template
```

### Architecture

- `source/core/`: transport-agnostic tool contract and registry
- `source/adapters/`: HTTP and editor message adapters
- `source/infra/`: runtime integrations (for example `Editor.Profile` storage wrapper)
- `source/skill/tools/`: domain tool modules (19 tools)
- `source/http/http-tool-server.ts`: HTTP server and `/skill/*` routes
- `source/main.ts`: extension lifecycle and adapter orchestration

## Troubleshooting

### Server Does Not Start

- Check Cocos Creator Console for startup errors.
- Confirm no process is monopolizing the configured port range.
- Inspect `.cocos-skill-config.json` for the latest `port` / `baseUrl`.
- Inspect `Editor.Profile` (`cocos-skill.server-config`) for persisted port/config values.

### API Call Fails

- Verify server status at `/skill/health`.
- Confirm request body matches tool schema.
- Use `/skill/tools` to inspect available tool names and descriptions.

## Changelog

See `CHANGELOG.md`.
