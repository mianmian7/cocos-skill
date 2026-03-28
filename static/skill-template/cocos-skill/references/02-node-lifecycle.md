# 02 — Node Creation, Deletion, Copying, And Reparenting

> **Channel**: `scene` | **Mode**: read/write
## When to Use

- You need to create nodes, duplicate nodes, change parent-child relationships, or restore prefab state.
- The behavior is not fully covered by `create_nodes` / `modify_nodes`, so you need low-level commands.

## Default Choice

Preferred order:

1. High-level tools: `create_nodes`, `modify_nodes`
2. Use the `editor_request` commands on this page only when high-level tools do not cover the case

This reduces serialization mistakes and argument-shape mistakes.

## Quick Flow

### Create Nodes

1. Confirm the target parent is a live node
2. `create-node`
3. If you need more components or property writes, move into the follow-up flow
4. Read back with `query-node` or `search_nodes`

### Reparent Nodes

1. Read both the target node and the new parent first
2. `set-parent`
3. If world transforms must stay stable, pass `keepWorldTransform` explicitly
4. Re-query the hierarchy

### Delete Or Move At Scale

1. Re-locate live UUIDs first
2. Evaluate blast radius
3. Prefer `apply_gated_action` for high-risk deletes
4. Re-query after the operation

## Core Commands

| Command | Use Case | Key Args | Returns |
|------|----------|----------|------|
| `create-node` | Create an empty node or create from an asset | `CreateNodeOptions` | `string` |
| `remove-node` | Delete one or more nodes | `RemoveNodeOptions` | `void` |
| `duplicate-node` | Duplicate in place | `string \| string[]` | `string[]` |
| `copy-node` / `cut-node` / `paste-node` | Clipboard-based copy / paste flow | matching options | `string[]` / `void` |
| `set-parent` | Change parent | `CutNodeOptions` | `string[]` |
| `reset-node` | Reset node properties | `{ uuid }` | `boolean` |
| `restore-prefab` | Restore prefab state | `{ uuid }` | `boolean` |

## Key Parameter Notes

- `create-node.parent`: parent node UUID
- `create-node.assetUuid`: use this when creating from an asset
- `create-node.position`: initial position
- `create-node.autoAdaptToCreate`: adapt creation to 2D / 3D mode
- `set-parent.keepWorldTransform`: preserve world transform while moving
- `remove-node.uuid`: accepts one UUID or an array

## Common Pitfalls

- `copy-node` / `cut-node` / `paste-node` is stateful, so it is a poor fit for implicit batch flows.
- `remove-node` mutates the live scene directly; do not trust stale UUIDs before bulk deletes.
- `create-node` can create from assets, but prefab and 2D / 3D mode differences must be checked explicitly.

## Verification

- After creation: `query-node` or `search_nodes`
- After reparenting: `query-node-tree`
- After deletion: `search_nodes` or a failing `query-node` readback

## Cross References

- Property writes: `references/03-node-properties.md`
- Scene-level rollback and snapshots: `references/07-scene-management.md`
