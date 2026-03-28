# 10 — Selection And Project / Preferences Settings

> **Channel**: `selection` + `project` + `preferences` | **Mode**: read/write
## When to Use

- You need to select nodes or assets for use with viewport operations.
- You need to read or write project settings.
- You need to open settings panels.

## Channel Boundaries

- `selection` is handled through the official `Editor.Selection` API in this extension, not through `Editor.Message.request`.
- `project` and `preferences` use similar command names, but their optional protocol enums are different.
- `project` supports `default | project`; `preferences` supports `default | global | local`.

## Signature Cheat Sheet

### Selection

- `select`: `args = [type: string, uuid: string | string[]] -> void`
- `unselect`: `args = [type: string, uuid: string | string[]] -> void`
- `clear`: `args = [type: string] -> void`
- This extension normalizes the second arg into a UUID list inside `editor_request`; the common `type` values are still `node` / `asset`

### Project

- `query-config`: `args = [scope: string, key?: string, protocol?: "default" | "project"] -> any`
- `set-config`: `args = [scope: string, key: string, value: any] -> boolean`
- `open-settings`: `args = [tab: string, section: string, ...args: any[]] -> undefined`

### Preferences

- `query-config`: `args = [scope: string, key?: string, protocol?: "default" | "global" | "local"] -> any`
- `set-config`: `args = [scope: string, key: string, value: any, protocol?: "default" | "global" | "local"] -> boolean`
- `open-settings`: `args = [panel: string, ...args: any[]] -> undefined`

## Quick Flow

### Select Nodes For View Operations

1. `select("node", [...uuids])`
2. Use `focus-camera` only if needed
3. Call `clear("node")` when the flow is done

### Read Or Update Project Settings

1. `query-config`
2. Decide the exact key and the new value
3. `set-config`
4. `query-config` again

## Common Pitfalls

- `selection` only exposes write operations here; if you need current selection state, inspect `context`.
- `project` and `preferences` have similar `query-config` / `set-config` signatures, but they do not point to the same config space.
- `project:open-settings` has one extra positional `section` arg compared with `preferences:open-settings`.
- `open-settings` only guarantees that the UI opens; it does not mean any config changed.

## Verification

- Selection state: `context`
- Config state: `query-config` again

## Cross References

- View operations: `references/09-viewport-gizmo.md`
- Scene context: `references/01-node-query.md`
