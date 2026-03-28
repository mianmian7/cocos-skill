# 01 — Node Query And Inspection

> **Channel**: `scene` | **Mode**: read-only
## When to Use

- You have just connected to the editor and need to confirm scene readiness or unsaved changes.
- You need to re-locate nodes from the live scene instead of trusting stale UUIDs.
- You need to find which nodes are using an asset UUID.

## Quick Flow

1. Start with `POST /skill/context` to inspect the current scene, selection, dirty state, and hierarchy summary.
2. If you are calling `editor_request` directly, check `query-is-ready` first.
3. For large scenes, prefer:
   - `query-node-tree` with `maxDepth` / `maxNodes`
   - or `search_nodes`
4. After you have the target UUID, call `query-node` for the full dump.
5. Re-query after changes to confirm the live state actually changed.

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `query-is-ready` | Health check before direct scene message calls | `boolean` | Do not continue with writes if it is not ready |
| `query-dirty` | Check whether the current scene needs saving | `boolean` | Run this before scene switches |
| `query-node-tree` | Inspect the tree or a subtree | `INode` | Limit `maxDepth` / `maxNodes` |
| `query-node` | Read a full dump for one node | `INode` | Useful for component UUIDs and property-path context |
| `query-nodes-by-asset-uuid` | Find nodes that reference an asset | `string[]` | Returns node UUIDs, not node details |
| `query-scene-bounds` | Read the scene bounds | `{ x, y, width, height }` | Useful for layout and viewport work |

## Signature Cheat Sheet

- `query-is-ready`: `args = [] -> boolean`
- `query-node`: `args = [uuid: string] -> INode`
- `query-node-tree`: `args = [] | [rootUuid: string] -> INode`
- `query-nodes-by-asset-uuid`: `args = [assetUuid: string] -> string[]`
- `query-dirty`: `args = [] -> boolean`
- `query-scene-bounds`: `args = [] -> { x, y, width, height }`

## Recommended Patterns

### Locate A Live Node

1. `context` or `search_nodes`
2. `query-node`
3. If you need component UUIDs, inspect `__comps__`

### Decide Whether To Save Before A Scene Switch

1. `query-dirty`
2. If dirty, save before switching

### Find Nodes From An Asset

1. `query-nodes-by-asset-uuid`
2. Run `query-node` for each returned UUID

## Common Pitfalls

- Do not run a full `query-node-tree` on large scenes unless you really need it; it can explode context size.
- `query-nodes-by-asset-uuid` only returns UUIDs, so you still need `query-node` afterwards.
- UUIDs from old chats go stale easily; re-search live nodes first.

## Verification

- After reading a node, optionally re-run `context` or `search_nodes` to confirm it belongs to the current live scene.
- For before/after comparisons, keep at least one fresh `query-node` or `query-dirty` readback.

## Cross References

- Property writes: `references/03-node-properties.md`
- Component inspection: `references/04-component-operations.md`
- Scene save / switch: `references/07-scene-management.md`
