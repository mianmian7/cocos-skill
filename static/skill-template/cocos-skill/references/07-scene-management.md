# 07 — Scene Open, Save, Close, And Snapshots

> **Channel**: `scene` | **Mode**: read/write
## When to Use

- You need to open, save, or close scenes.
- You need a rollback point before batch scene edits.
- You need to handle dirty state before switching scenes.

## Default Choice

Preferred order:

1. High-level tool `operate_current_scene`
2. Use the `editor_request` commands on this page only when the high-level tool is not enough

## Quick Flow

### Switch Scenes

1. `query-dirty`
2. Save first if dirty
3. Use `query-uuid` to get the target scene asset UUID
4. `open-scene`
5. Verify with `context` or `query-dirty`

### Create A Rollback Point Before Batch Changes

1. `snapshot`
2. Run the batch of edits
3. Keep the snapshot if the batch succeeds and the user may need undo
4. If the batch fails and should be discarded, call `snapshot-abort`

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `open-scene` | Open a scene | `void` | Argument is the scene asset UUID |
| `save-scene` | Save the current scene | `string \| undefined` | Passing `true` acts like save-as |
| `save-as-scene` | Save as | `string \| undefined` | Opens UI; poor fit for no-UI automation |
| `close-scene` | Close the current scene | `boolean` | Handle dirty state first |
| `snapshot` | Create an undo snapshot | `void` | Recommended before batch edits |
| `snapshot-abort` | Discard changes since the last snapshot | `void` | Used for failure rollback |
| `soft-reload` | Soft-reload the scene | `void` | Refreshes state, not a full reopen |

## Signature Cheat Sheet

- `open-scene`: `args = [sceneAssetUuid: string] -> void`
- `save-scene`: `args = [] | [saveAs?: boolean] -> string | undefined`
- `save-as-scene`: `args = [] -> string | undefined`
- `close-scene`: `args = [] -> boolean`
- `snapshot` / `snapshot-abort` / `soft-reload`: `args = [] -> void`

## Common Pitfalls

- `save-as-scene` opens a file dialog, so it is a poor fit for unattended automation.
- Skipping `query-dirty` before scene switches is the easiest way to lose the current work state.
- `snapshot` is not an automatic commit point; it exists for undo and rollback.

## Verification

- After a scene switch: `context` / `query-dirty`
- After saving: check the returned path or re-check dirty state
- After rollback: re-query the key nodes or state you care about

## Cross References

- Node lifecycle: `references/02-node-lifecycle.md`
- Asset queries: `references/05-asset-query.md`
