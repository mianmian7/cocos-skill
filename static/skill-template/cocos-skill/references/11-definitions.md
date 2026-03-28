# 11 — Definitions (Property Paths And Type Hints)

## When to Use

- Before any property write.
- When you are unsure about the correct `path`, `type`, enum value, or visible field.
- When you want to reduce bad writes caused by model guessing.

## Default Flow

1. Locate the target node or component UUID
2. Call definitions
3. Read `properties[].path` and `properties[].type` from the result
4. Then call `modify_nodes`, `modify_components`, or `editor_request` if necessary

## Node Definitions

Request:

```json
{
  "nodeUuids": ["<nodeUuid>"],
  "includeTooltips": false,
  "hideInternalProps": true,
  "includeTs": true
}
```

Key response fields:

- `nodes[].type`
- `nodes[].properties[]: { path, type, tooltip?, enumValues? }`
- `nodes[].ts`

## Component Definitions

Request:

```json
{
  "componentUuids": ["<componentUuid>"],
  "includeTooltips": true,
  "hideInternalProps": true,
  "includeTs": true
}
```

Key response fields:

- `components[].type`
- `components[].properties[]: { path, type, tooltip?, enumValues? }`
- `components[].ts`

## Parameter Guidance

- Use `hideInternalProps=true` by default so the result stays cleaner.
- Consider `hideInternalProps=false` only when debugging deep internal fields.
- `includeTs=true` is useful when generating code or constraining prompts.

## Common Pitfalls

- Definitions are not a write operation; they belong to the discovery phase.
- Expand internal paths like `__comps__.*` or `__children__.*` only when you explicitly need them.
- Definitions return available paths and type hints, not completed writes.

## Cross References

- Node properties: `references/03-node-properties.md`
- Component operations: `references/04-component-operations.md`
