# 03 — Node Property Reads And Writes

> **Channel**: `scene` | **Mode**: read/write
## When to Use

- You need to change node transform, active state, name, hierarchy, or similar properties.
- You need to change component properties that are not directly covered by high-level tools.
- You need to reorder array properties or remove array elements.

## Default Choice

Preferred order:

1. `get_node_definitions` / `get_component_definitions`
2. `modify_nodes` / `modify_components`
3. Use the `editor_request` commands on this page only when high-level tools are not enough

Do not guess `path` or `dump.type`.

## Quick Flow

1. Read definitions first to confirm valid `path` and `type`
2. Apply the property write
3. Use array commands only when you are modifying array fields
4. Read back with `query-node`, `query-components`, or `context` immediately after the write

## Core Commands

| Command | Use Case | Key Args | Returns |
|------|----------|----------|------|
| `set-property` | Write one node or component property | `SetPropertyOptions` | `boolean` |
| `reset-property` | Reset a property to its default value | `SetPropertyOptions` | `boolean` |
| `move-array-element` | Reorder an array element | `MoveArrayOptions` | `boolean` |
| `remove-array-element` | Remove an array element | `RemoveArrayOptions` | `boolean` |

## Signature Cheat Sheet

- `set-property`: `args = [{ uuid, path, dump }] -> boolean`
- `reset-property`: `args = [{ uuid, path, dump }] -> boolean`
- `move-array-element`: `args = [{ uuid, path, target, offset }] -> boolean`
- `remove-array-element`: `args = [{ uuid, path, index }] -> boolean`
- `dump.type` must match the real definitions / dump type. Do not invent it.

## Common Paths

| Path | Meaning | Common Type |
|------|------|----------|
| `position` | Node position | `cc.Vec3` |
| `scale` | Node scale | `cc.Vec3` |
| `eulerAngles` | Euler rotation | `cc.Vec3` |
| `active` | Active state | `Boolean` |
| `name` | Node name | `String` |
| `__comps__.{index}.{property}` | Component property path | Read definitions first |

## Common Pitfalls

- `uuid` points to the property owner; it can be either a node or a component.
- `__comps__.0.xxx` is just an example. Real component indices are not guaranteed to be `0`.
- `dump.type` must match the real dump type; do not invent one.
- Prefer `modify_components` for component property writes; do not jump straight to `set-property` without a confirmed path.

## Verification

- Node property changes: `query-node`
- Component property changes: `query-node` or `query-components`
- Array operations: read back the full dump and confirm order or count changes

## Cross References

- Definitions: `references/11-definitions.md`
- Node creation / reparenting: `references/02-node-lifecycle.md`
- Component operations: `references/04-component-operations.md`
