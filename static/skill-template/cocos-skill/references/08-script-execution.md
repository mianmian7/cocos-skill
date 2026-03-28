# 08 — Scene Script And Component Method Execution

> **Channel**: `scene` | **Mode**: execute
## When to Use

- You need to call a registered scene script method.
- You need to call a public method on a component instance.
- High-level tools cannot express the behavior, but you already know the method name, args, and target object.

## Default Rules

- Use this path only for registered methods.
- If the real goal is arbitrary code execution, prefer the high-level `execute_scene_code` tool.
- Re-confirm live node / component UUIDs before execution.

## Core Commands

| Command | Use Case | Key Args | Returns |
|------|----------|----------|------|
| `execute-scene-script` | Call a scene script method | `{ name, method, args }` | `any` |
| `execute-component-method` | Call a component instance method | `{ uuid, name, args }` | `any` |

## Signature Cheat Sheet

- `execute-scene-script`: `args = [{ name: string, method: string, args: any[] }] -> any`
- `execute-component-method`: `args = [{ uuid: string, name: string, args: any[] }] -> any`
- Scene scripts use the `method` field for the method name; component calls do not.

## Quick Flow

### Call A Scene Script

1. Confirm that the script name and method name are registered and callable
2. Pass the minimum required args
3. Read back either the return value or the scene state immediately after execution

### Call A Component Method

1. Start with `query-node`
2. Get the component UUID from `__comps__`
3. `execute-component-method`
4. Re-query node or component state

## Common Pitfalls

- `execute-component-method.uuid` is a component UUID, not a node UUID.
- These calls can have side effects, so do not treat them as read-only queries.
- “Can execute” is not the same as “should execute”; if a high-level tool can express the action, prefer that route.

## Verification

- If the return value itself is meaningful, inspect it first
- If scene or component state changes, re-run `query-node`, `query-components`, or `context`

## Cross References

- Node and component lookup: `references/01-node-query.md`
- Component operations: `references/04-component-operations.md`
