# 09 — Gizmo, Viewport, And 2D/3D State

> **Channel**: `scene` | **Mode**: read/write
## When to Use

- You need to read or change the current Gizmo tool, pivot, coordinate space, or 2D/3D state.
- You need to focus the viewport or align the view with nodes.

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `query-gizmo-tool-name` | Read the current tool | `string` | `move` / `rotate` / `scale` / `rect` |
| `change-gizmo-tool` | Change the current tool | `void` | Changes editor view state |
| `query-gizmo-pivot` / `change-gizmo-pivot` | Read or change pivot mode | `string` / `void` | `pivot` / `center` |
| `query-gizmo-coordinate` / `change-gizmo-coordinate` | Read or change coordinate mode | `string` / `void` | `local` / `global` |
| `query-is2D` / `change-is2D` | Read or change 2D mode | `boolean` / `void` | Affects editor mode |
| `query-is-grid-visible` / `set-grid-visible` | Read or change grid visibility | `boolean` / `void` | View state only |
| `focus-camera` | Focus the camera on nodes | `void` | Arg is `string[]` |
| `align-with-view` / `align-view-with-node` | Align nodes or view | `void` | Affects the current view or selected node |

## Signature Cheat Sheet

- `change-gizmo-tool`: `args = [tool: string]`; common values are `move | rotate | scale | rect`
- `change-gizmo-pivot`: `args = [pivot: string]`; common values are `pivot | center`
- `change-gizmo-coordinate`: `args = [coordinate: string]`; common values are `local | global`
- `change-is2D` / `set-grid-visible`: `args = [boolean]`
- `focus-camera`: `args = [string[]]`
- `align-with-view` / `align-view-with-node`: `args = []`

## Quick Flow

### Focus On A Target Node

1. Confirm the target node UUID first
2. `focus-camera([uuid])`
3. Re-check mode or tool state only if needed

### Switch To 2D Editing Mode

1. `query-is2D`
2. Call `change-is2D(true)` only if a change is required
3. Query again if confirmation matters

## Common Pitfalls

- These commands mainly change editor view state; they do not automatically mean scene data changed.
- `focus-camera` expects a UUID array, not a single string.
- Do not treat viewport changes as business-state validation; real scene verification still needs node or component reads.

## Verification

- For mode changes: query again with the matching `query-*`
- For focus or alignment changes: inspect live viewport behavior, but use separate readback for scene data changes

## Cross References

- Node lookup: `references/01-node-query.md`
- Selection and project settings: `references/10-selection-and-project.md`
