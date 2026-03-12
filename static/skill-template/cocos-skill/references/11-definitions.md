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
- 节点 dump 来自 `scene.query-node`，可能包含大量内部字段，建议 `hideInternalProps=true`。
- TS 片段用于提示词/代码模式输入，帮助 LLM 使用正确的 property path 与 type。
