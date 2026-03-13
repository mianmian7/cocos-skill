# Definitions (Schema / Type Hints)

cocos-skill 提供了 definitions 端点，用于在修改前“先发现、再行动（discover then act）”，避免 AI 猜测属性路径/类型导致失败或误改。

## 组件 Definitions

Endpoint:
- POST `/skill/definitions/components`

Tool:
- `get_component_definitions`

Request:
```json
{
  "componentUuids": ["<componentUuid>"] ,
  "includeTooltips": true,
  "hideInternalProps": true,
  "includeTs": true
}
```

Response (shape):
- `components[].type`
- `components[].properties[]: { path, type, tooltip?, enumValues? }`
- `components[].ts` (when includeTs=true)

Usage:
1) Use `query_nodes` / `query_components` to get component UUIDs
2) Call definitions to get valid property paths/types
3) Use `modify_components` using those paths/types

## 节点 Definitions

Endpoint:
- POST `/skill/definitions/nodes`

Tool:
- `get_node_definitions`

Request:
```json
{
  "nodeUuids": ["<nodeUuid>"] ,
  "includeTooltips": false,
  "hideInternalProps": true,
  "includeTs": true
}
```

Notes:
- 节点 dump 来自 `scene.query-node`。
- `hideInternalProps=true`（默认）会过滤掉 `_`/`__` 等内部字段，输出更干净。
- `hideInternalProps=false` 可用于排查/高级用法，会包含如 `__comps__.*`、`__children__.*` 等路径（数据量会明显增大）。
- TS 片段用于提示词/代码模式输入，帮助 LLM 使用正确的 property path 与 type。
