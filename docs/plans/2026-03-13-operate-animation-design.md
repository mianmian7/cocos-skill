# Operate Animation Design

**Goal:** 为 `cocos-skill` 增加结构化的动画系统控制能力，同时覆盖：
- `cc.Animation` / `cc.SkeletalAnimation`（传统动画组件）
- `cc.animation.AnimationController`（动画图控制器）

## Non-Goals

- 不实现动画资源编辑/关键帧曲线编辑/时间轴 UI 等编辑器级功能。
- 不做任何“自动猜测/自动选择”的降级：目标不明确时直接报错并返回候选列表（Debug-First）。

## Public API (Tool + HTTP)

- Tool：`operate_animation`
- HTTP：`POST /skill/animation`

### Request (概念)

```json
{
  "operation": "list|inspect|play|crossFade|pause|resume|stop|getState|setState|getVariables|getValue|setValue|getStatus|getLayerWeight|setLayerWeight",
  "target": {
    "kind": "legacy|controller",
    "nodeUuid": "<encoded>",
    "componentUuid": "<encoded optional>"
  },
  "options": {}
}
```

### Response (概念)

```json
{
  "success": true,
  "operation": "play",
  "targetResolved": { "nodeUuid": "<encoded>", "componentUuid": "<encoded>", "kind": "legacy" },
  "data": {},
  "errors": [],
  "logs": []
}
```

## Scene Script Contract

避免 `execute_scene_code` 拼字符串脚本；`operate_animation` 通过 `scene.execute-scene-script` 调用扩展的 scene 方法：

- `operateAnimation(request)`：在场景上下文内解析节点/组件并执行操作，返回可 JSON 序列化的数据结构。

## Target Resolution Rules

- `nodeUuid` 必填。
- `componentUuid` 可选：
  - 未提供且候选组件数量为 `1`：自动选择该组件。
  - 未提供且候选数量 `0`：报错 `not_found`。
  - 未提供且候选数量 `>1`：报错 `ambiguous_target`，并返回候选 `{ uuid, type, kind }` 列表。

## Supported Operations

### legacy (`Animation`/`SkeletalAnimation`)

- `list`：列出该节点上的 legacy 动画组件（以及 controller，一并返回用于排障）。
- `inspect`：返回 `playOnLoad/defaultClip/clips` 概览。
- `play`：`options.clipName?`；若未提供则要求存在 `defaultClip`。
- `crossFade`：`options.clipName` + `options.duration?`。
- `pause` / `resume` / `stop`
- `getState`：`options.stateName`（默认同 `clipName` 语义）。
- `setState`：`options.stateName` + `options.patch`（仅允许可写字段：`time/speed/wrapMode/repeatCount/delay/playbackRange/weight`）。

### controller (`AnimationController`)

- `getVariables`：返回 `{ name, type }[]`
- `getValue` / `setValue`：`options.variableName` + `options.value`
- `getStatus`：`options.layer`，返回 current/next state status、transition、clip statuses 等结构化数据
- `getLayerWeight` / `setLayerWeight`：`options.layer` + `options.weight?`

## Error Handling

- 目标解析失败、操作参数缺失：返回 `success:false` + `error`（字符串）+ `details`（结构化可选）。
- 工具层仍遵循现有模式：`startCaptureSceneLogs` → 执行 → `getCapturedSceneLogs` → `snapshot`。

## Testing

- `node:test` 单测覆盖：
  - 工具调用链：是否正确调用 `execute-scene-script` 的方法名与参数
  - 失败路径：模块不可用/返回 `success:false`
  - 成功路径：返回 JSON 结构包含 `success/operation/targetResolved/data`

