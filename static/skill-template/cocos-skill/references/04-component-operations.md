# 04 — Component Add, Remove, Inspect, And Type Discovery

> **Channel**: `scene` | **Mode**: read/write
## When to Use

- You need to add components to nodes, remove components, or reset components.
- You need to confirm which component classes are available, or whether a component is backed by a script.

## Quick Flow

### Add A Component To A Node

1. Confirm the target node UUID
2. Use `query-classes` or `query-components` to inspect available types
3. `create-component`
4. Read back the node dump and confirm the component was actually attached

### Remove A Component

1. Start with `query-node`
2. Get the real component UUID from `__comps__`
3. `remove-component`
4. `query-node` again

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `create-component` | Attach a component to a node | `void` | `uuid` is the node UUID |
| `remove-component` | Remove a component | `void` | `uuid` is the component UUID |
| `reset-component` | Reset a component | `void` | Also takes a component UUID |
| `query-component` | Read a single component dump | `IComponent` | Good for property and default-value inspection |
| `query-components` | List registered component types | `Array<{ name, cid, path, assetUuid }>` | Full registered-type inventory |
| `query-classes` | Filter component class names by base class | `Array<{ name }>` | Useful when choosing a type |
| `query-component-has-script` | Check whether a component has a script | `boolean` | Common for custom-component checks |

## Common Pitfalls

- `remove-component` / `reset-component` uses the component UUID, not the node UUID.
- `query-components` and `query-classes` are not the same thing.
  - The first is closer to registered component metadata.
  - The second is closer to creatable class-name discovery.
- After adding a component, do not trust success status alone. Re-read the node dump.

## Verification

- After add: `query-node`
- After remove: `query-node`
- Before component property writes: inspect `query-component` or definitions first

## Cross References

- Property paths: `references/03-node-properties.md`
- Definitions: `references/11-definitions.md`
