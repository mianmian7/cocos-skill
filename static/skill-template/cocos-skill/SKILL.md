---
name: cocos-skill
description: Control Cocos Creator editor through HTTP API — scene editing, node manipulation, asset management, component operations.
---

# Cocos Creator cocos-skill — Editor Control Skill

This skill enables AI agents to interact with the Cocos Creator editor through the **cocos-skill extension**. The extension exposes an HTTP server inside the editor, giving you full programmatic control over scenes, nodes, assets, components, and project settings.

## Connection

The extension writes connection metadata to `.cocos-skill-config.json` in the project root.

Use this connection flow:

1. Read `${projectRoot}/.cocos-skill-config.json`
2. Use `baseUrl` directly, or derive from `port` as `http://127.0.0.1:{port}/skill`
3. Verify with `GET {baseUrl}/health`
4. Only if the file is missing, fallback to scanning ports (`3000..4009`)

```bash
# Bash (Linux/macOS/WSL) - read baseUrl from config file
BASE_URL=$(python3 - <<'PY'
import json
from pathlib import Path
cfg = Path(".cocos-skill-config.json")
data = json.loads(cfg.read_text(encoding="utf-8"))
print(data.get("baseUrl") or f"http://127.0.0.1:{data['port']}/skill")
PY
)
curl -sf "${BASE_URL}/health"
```

```powershell
# PowerShell (Windows) - read baseUrl from config file
$cfg = Get-Content ".cocos-skill-config.json" | ConvertFrom-Json
$baseUrl = if ($cfg.baseUrl) { $cfg.baseUrl } else { "http://127.0.0.1:$($cfg.port)/skill" }
Invoke-RestMethod -Method Get -Uri "$baseUrl/health"
```

All endpoints below assume `http://127.0.0.1:{port}`.

## Transports

| Transport | Endpoint | Use Case |
|-----------|----------|----------|
| **HTTP REST** | `/skill/*` | Direct tool calls — recommended |

**For AI agents calling tools directly, use the HTTP REST endpoints (`/skill/*`).**

## HTTP REST Endpoints

### Service Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skill/health` | Health check — returns `{ status, port, tools, version }` |
| GET | `/skill/tools` | List all available tools |
| POST | `/skill/tool/:toolName` | Generic tool endpoint — call any tool by name |

### Tool Endpoints

| Method | Path | Tool | Description |
|--------|------|------|-------------|
| POST (recommended), GET (compatible) | `/skill/context` | `get_editor_context` | Get current editor state (scene, selection, hierarchy) |
| POST | `/skill/search-nodes` | `search_nodes` | Search nodes by name, component, or path pattern |
| POST | `/skill/query-nodes` | `query_nodes` | Query node details by UUID |
| POST | `/skill/create-nodes` | `create_nodes` | Create new nodes in the scene |
| POST | `/skill/modify-nodes` | `modify_nodes` | Modify node properties, components, parent |
| POST | `/skill/definitions/nodes` | `get_node_definitions` | Get node property definitions (path->type) and optional TS fragments |
| POST | `/skill/query-components` | `query_components` | Query component details |
| POST | `/skill/modify-components` | `modify_components` | Modify component properties |
| POST | `/skill/definitions/components` | `get_component_definitions` | Get component property definitions (path->type) and optional TS fragments |
| POST | `/skill/current-scene` | `operate_current_scene` | Scene operations (open, save, close) |
| POST | `/skill/assets` | `operate_assets` | Asset CRUD operations |
| POST | `/skill/prefab-assets` | `operate_prefab_assets` | Prefab asset operations |
| POST | `/skill/node-prefab` | `node_linked_prefabs_operations` | Node-prefab link operations |
| GET | `/skill/discovery/components` | `get_available_component_types` | List all available component types |
| GET | `/skill/discovery/assets` | `get_available_asset_types` | List all available asset types |
| POST | `/skill/discovery/assets-by-type` | `get_assets_by_type` | Get assets filtered by type |
| POST | `/skill/project-settings` | `operate_project_settings` | Read/write project settings |
| POST | `/skill/scripts-text` | `operate_scripts_and_text` | Read/write script and text files |
| POST | `/skill/execute-scene` | `execute_scene_code` | Execute code in the scene context |
| POST | `/skill/editor-request` | `editor_request` | Low-level editor message gateway |
| POST | `/skill/apply-gated-action` | `apply_gated_action` | Two-step destructive operations |

## Recommended Workflow

```
1. POST /skill/context          → understand current state
2. POST /skill/search-nodes     → find target nodes
3. POST /skill/create-nodes     → create new nodes (if needed)
   POST /skill/modify-nodes     → modify existing nodes
4. POST /skill/context          → verify changes
```

## Core Operations — Examples

### 1. Get Editor Context

Recommended:

```http
POST /skill/context
Content-Type: application/json

{
  "includeHierarchy": true,
  "summaryOnly": false,
  "maxDepth": 2,
  "maxNodes": 100
}
```

Compatible GET form:

```http
GET /skill/context?includeHierarchy=true&summaryOnly=false&maxDepth=2&maxNodes=100
```

Notes:
- `POST` is preferred because JSON preserves value types.
- `GET` query values are strings by HTTP design; server-side validation now accepts compatible boolean/number strings (for example `true`, `false`, `2`, `100`).

Returns: edit mode, current scene/prefab, dirty state, selected nodes, hierarchy tree, recent logs, editor version, project path.

**Parameters:**
- `includeHierarchy` (bool, default true) — include scene tree
- `summaryOnly` (bool, default false) — minimal data for large scenes (3000+ nodes)
- `maxDepth` (1–10, default 2) — hierarchy traversal depth
- `maxNodes` (default 100, max 500; summaryOnly max 5000) — node limit
- `parentUuid` (string) — scope to subtree

### 2. Search Nodes

```http
POST /skill/search-nodes
Content-Type: application/json

{
  "namePattern": "Enemy*",
  "componentType": "Sprite",
  "pathPattern": "Canvas/*/Enemies/*",
  "limit": 50,
  "offset": 0
}
```

At least one of `namePattern`, `componentType`, or `pathPattern` is required. Wildcards `*` (any chars) and `?` (single char) are supported, case-insensitive.

### 3. Create Nodes

```http
POST /skill/create-nodes
Content-Type: application/json

{
  "parentUuid": "optional-parent-uuid",
  "nodes": [
    {
      "type": "2D/Sprite",
      "name": "PlayerSprite",
      "position": { "x": 0, "y": 100, "z": 0 },
      "components": ["Animation"]
    },
    {
      "type": "UI/Button (with Label)",
      "name": "StartButton"
    }
  ]
}
```

**Supported node types:**
- Basic: `Empty`, `Prefab`
- 3D: `3D/Cube`, `3D/Sphere`, `3D/Capsule`, `3D/Cone`, `3D/Cylinder`, `3D/Plane`, `3D/Quad`, `3D/Torus`
- 2D: `2D/Sprite`, `2D/Label`, `2D/Graphics`, `2D/Mask`, `2D/ParticleSystem2D`, `2D/SpriteSplash`, `2D/TiledMap`, `SpriteRenderer`
- UI: `UI/Button (with Label)`, `UI/Canvas`, `UI/EditBox`, `UI/Layout`, `UI/PageView`, `UI/ProgressBar`, `UI/RichText`, `UI/ScrollView`, `UI/Slider`, `UI/Toggle`, `UI/ToggleGroup`, `UI/VideoPlayer`, `UI/WebView`, `UI/Widget`
- Light: `Light/Directional`, `Light/Sphere`, `Light/Spot`, `Light/LightProbeGroup`, `Light/ReflectionProbe`
- Other: `ParticleSystem`, `Camera`, `Terrain`

### 4. Modify Nodes

```http
POST /skill/modify-nodes
Content-Type: application/json

{
  "nodes": [
    {
      "uuid": "target-node-uuid",
      "properties": {
        "name": "RenamedNode",
        "position": { "x": 10, "y": 20, "z": 0 },
        "scale": { "x": 2, "y": 2, "z": 1 },
        "enabled": true
      },
      "addComponents": ["RigidBody2D", "BoxCollider2D"],
      "newParentUuid": "new-parent-uuid"
    }
  ]
}
```

### 5. Editor Request — Low-Level API

The `editor_request` tool provides direct access to Cocos Creator's internal messaging system.

```http
POST /skill/editor-request
Content-Type: application/json

{
  "channel": "scene",
  "command": "set-property",
  "args": [{
    "uuid": "node-uuid",
    "path": "position",
    "dump": {
      "type": "cc.Vec3",
      "value": { "x": 10, "y": 20, "z": 30 }
    }
  }]
}
```

**List available commands:**
```http
POST /skill/editor-request
{ "channel": "scene", "listCommands": true }
```

#### Channels & Key Commands

**scene** — Scene graph operations
- Read: `query-node`, `query-node-tree`, `query-component`, `query-components`, `query-classes`, `query-dirty`, `query-is-ready`
- Write: `create-node`, `remove-node`, `set-property`, `reset-property`, `create-component`, `remove-component`, `duplicate-node`, `set-parent`
- Scene: `open-scene`, `save-scene`, `save-as-scene`, `close-scene`
- Camera: `focus-camera`, `align-with-view`, `align-view-with-node`
- Execute: `execute-scene-script`, `execute-component-method`

**asset-db** — Asset database
- Read: `query-asset-info`, `query-asset-meta`, `query-assets`, `query-path`, `query-url`, `query-uuid`
- Write: `create-asset`, `save-asset`, `save-asset-meta`, `copy-asset`, `move-asset`, `delete-asset`
- Import: `import-asset`, `refresh-asset`, `reimport-asset`

**selection** — Editor selection
- `select`, `unselect`, `clear`

**project** — Project settings
- `query-config`, `set-config`, `open-settings`

#### Editor Request — Detailed Reference

For exact parameter signatures, return types, and usage examples, read the corresponding reference file:

| Task | Reference File |
|------|----------------|
| Query nodes & inspect scene tree | `references/01-node-query.md` |
| Create / delete / copy / move nodes | `references/02-node-lifecycle.md` |
| Set position, scale, color, or any property | `references/03-node-properties.md` |
| Add / remove / query components | `references/04-component-operations.md` |
| Query assets, dependencies & metadata | `references/05-asset-query.md` |
| Create / save / delete / import assets | `references/06-asset-crud.md` |
| Open / save / close scenes & undo | `references/07-scene-management.md` |
| Execute scene scripts & component methods | `references/08-script-execution.md` |
| Gizmo tools, viewport & 2D/3D toggle | `references/09-viewport-gizmo.md` |
| Selection operations & project settings | `references/10-selection-and-project.md` |
| Definitions (schema/type hints) | `references/11-definitions.md` |

### 6. Gated Actions — Two-Step Destructive Operations

Dangerous operations require a two-step approval flow:

**Step 1 — Request approval:**
```http
POST /skill/apply-gated-action
{ "action": "delete_nodes", "params": { "uuids": ["node-uuid-1"] } }
```
Response: `{ "approvalToken": "abc123", "riskLevel": "high", "summary": "..." }`

**Step 2 — Execute with token:**
```http
POST /skill/apply-gated-action
{ "action": "delete_nodes", "params": { "uuids": ["node-uuid-1"] }, "approvalToken": "abc123" }
```

**Gated action types:**
| Action | Risk | Description |
|--------|------|-------------|
| `delete_nodes` | high | Delete nodes (`{uuid}` or `{uuids: [...]}`) |
| `delete_assets` | critical | Delete assets (`{url}` or `{urls: [...]}`) |
| `save_scene` | medium | Save current scene |
| `save_all` | medium | Save all changes |
| `execute_code` | critical | Execute arbitrary scene code (`{code, options?}`) |
| `batch_modify` | high | Batch modify nodes/assets |
| `clear_scene` | critical | Clear all scene nodes |

Approval tokens expire after 5 minutes.

## Property Path & Value Type Reference

When using `editor_request` with `set-property`:

| Property | Path | Dump Type | Example Value |
|----------|------|-----------|---------------|
| Position | `position` | `cc.Vec3` | `{ "x": 0, "y": 0, "z": 0 }` |
| Rotation | `eulerAngles` | `cc.Vec3` | `{ "x": 0, "y": 45, "z": 0 }` |
| Scale | `scale` | `cc.Vec3` | `{ "x": 1, "y": 1, "z": 1 }` |
| Active | `active` | `Boolean` | `true` |
| Layer | `layer` | `Number` | `33554432` |
| Mobility | `mobility` | `Number` | `0` (Static), `1` (Stationary), `2` (Movable) |
| Color (comp) | `__comps__.0.color` | `cc.Color` | `{ "r": 255, "g": 0, "b": 0, "a": 255 }` |
| String (comp) | `__comps__.0.string` | `String` | `"Hello"` |
| SpriteFrame | `__comps__.0.spriteFrame` | `cc.SpriteFrame` | `{ "uuid": "asset-uuid" }` |

Component properties use `__comps__.{index}.{property}` path format, where index is the component's position in the node's component list.

## Tips

1. **Always start with `/skill/context`** to understand the current editor state before making changes. Prefer `POST`; `GET` is compatible.
2. **Discover then Act**: Before calling `modify_nodes` / `modify_components`, call definitions first:
   - `/skill/definitions/nodes` (`get_node_definitions`)
   - `/skill/definitions/components` (`get_component_definitions`)
   Use the returned property `path` + `type` to avoid guessing/hallucination.

2. **Port discovery**: Read `${projectRoot}/.cocos-skill-config.json` and use `baseUrl` (or `port`) before any API call.
3. **Asset operations must preflight-query first**: Before `create/copy/move`, always query destination with `asset-db.query-asset-info` (or `/skill/editor-request`) and decide explicitly: `skip` when exists and neither `overwrite` nor `rename` is set. For `copy/move`, also query source and fail fast if source is missing.
4. **Large scenes (3000+ nodes)**: Use `summaryOnly=true` with `get_editor_context`, then `search_nodes` to find specific nodes.
5. **UUID format**: Node/component UUIDs are auto-encoded (Base64) in responses. Pass them back as-is — the server decodes them automatically.
6. **Verify after changes**: Always call `/skill/context` (prefer `POST`) or `search_nodes` after modifications to confirm success.
7. **Use high-level tools first**: Prefer `/skill/create-nodes`, `/skill/modify-nodes` over raw `editor_request` — they handle serialization and error recovery.
8. **Fallback to `editor_request`**: For operations not covered by high-level tools (e.g., `focus-camera`, `duplicate-node`, asset-db queries), use the editor request gateway.
9. **Gated actions**: Destructive operations (`delete_nodes`, `clear_scene`, etc.) require two-step approval. Always handle the token flow.
