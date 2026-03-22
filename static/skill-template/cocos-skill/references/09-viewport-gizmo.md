# 09 — Gizmo/视口/2D-3D 切换

> **通道**: `scene` | **模式**: 读写（影响编辑器视口状态）

## 命令一览

### 查询命令

| 命令 | 说明 | 返回值 |
|------|------|--------|
| `query-gizmo-tool-name` | 当前 Gizmo 工具 | `"move" \| "rotate" \| "scale" \| "rect"` |
| `query-gizmo-pivot` | 当前轴心模式 | `"pivot" \| "center"` |
| `query-gizmo-coordinate` | 当前坐标系模式 | `"local" \| "global"` |
| `query-is2D` | 是否 2D 模式 | `boolean` |
| `query-is-grid-visible` | 网格是否可见 | `boolean` |

### 设置命令

| 命令 | 说明 | 参数 |
|------|------|------|
| `change-gizmo-tool` | 切换 Gizmo 工具 | `[toolName]` |
| `change-gizmo-pivot` | 切换轴心模式 | `[pivot]` |
| `change-gizmo-coordinate` | 切换坐标系 | `[coordinate]` |
| `change-is2D` | 切换 2D/3D 模式 | `[is2D]` |
| `set-grid-visible` | 设置网格可见性 | `[visible]` |
| `focus-camera` | 聚焦摄像机到节点 | `[uuids[]]` |
| `align-with-view` | 节点对齐到视图 | `[]` |
| `align-view-with-node` | 视图对齐到节点 | `[]` |

---

## 命令详情

### `query-gizmo-tool-name`

查询当前 Gizmo 工具名称。

```typescript
// 参数
[]

// 返回值
string  // "move" | "rotate" | "scale" | "rect"
```

---

### `change-gizmo-tool`

切换 Gizmo 工具。

```typescript
// 参数
[toolName: string]  // "move" | "rotate" | "scale" | "rect"

// 返回值
void
```

**示例：**
```typescript
// 切换到旋转工具
editor_request({
  channel: "scene",
  command: "change-gizmo-tool",
  args: ["rotate"]
})
```

---

### `query-gizmo-pivot`

查询当前 Gizmo 轴心模式。

```typescript
// 参数
[]

// 返回值
string  // "pivot" | "center"
```

---

### `change-gizmo-pivot`

切换 Gizmo 轴心模式。

```typescript
// 参数
[pivot: string]  // "pivot" | "center"

// 返回值
void
```

---

### `query-gizmo-coordinate`

查询当前 Gizmo 坐标系模式。

```typescript
// 参数
[]

// 返回值
string  // "local" | "global"
```

---

### `change-gizmo-coordinate`

切换 Gizmo 坐标系。

```typescript
// 参数
[coordinate: string]  // "local" | "global"

// 返回值
void
```

---

### `query-is2D`

查询当前是否为 2D 编辑模式。

```typescript
// 参数
[]

// 返回值
boolean
```

---

### `change-is2D`

切换 2D/3D 编辑模式。

```typescript
// 参数
[is2D: boolean]

// 返回值
void
```

**示例：**
```typescript
// 切换到 2D 模式
editor_request({
  channel: "scene",
  command: "change-is2D",
  args: [true]
})
```

---

### `query-is-grid-visible`

查询网格是否可见。

```typescript
// 参数
[]

// 返回值
boolean
```

---

### `set-grid-visible`

设置网格可见性。

```typescript
// 参数
[visible: boolean]

// 返回值
void
```

---

### `focus-camera`

聚焦摄像机到指定节点。

```typescript
// 参数
[uuids: string[]]  // 节点 UUID 数组

// 返回值
void
```

**示例：**
```typescript
// 聚焦到单个节点
editor_request({
  channel: "scene",
  command: "focus-camera",
  args: [["target-node-uuid"]]
})

// 聚焦到多个节点（视图会包含所有节点）
editor_request({
  channel: "scene",
  command: "focus-camera",
  args: [["node-1", "node-2", "node-3"]]
})
```

---

### `align-with-view`

将选中节点对齐到当前视图（节点的 transform 会匹配当前摄像机视角）。

```typescript
// 参数
[]

// 返回值
void
```

> **前提：** 需要先用 `selection.select` 选中节点。

---

### `align-view-with-node`

将视图对齐到选中节点（摄像机会移动到节点位置）。

```typescript
// 参数
[]

// 返回值
void
```

> **前提：** 需要先用 `selection.select` 选中节点。

---

## 常见用法模式

### 模式 1：为 2D 项目配置视口

```typescript
// 切换到 2D 模式
await editor_request({
  channel: "scene",
  command: "change-is2D",
  args: [true]
});

// 使用矩形工具
await editor_request({
  channel: "scene",
  command: "change-gizmo-tool",
  args: ["rect"]
});

// 隐藏网格
await editor_request({
  channel: "scene",
  command: "set-grid-visible",
  args: [false]
});
```

### 模式 2：聚焦到目标节点并对齐视图

```typescript
// 1. 聚焦摄像机
await editor_request({
  channel: "scene",
  command: "focus-camera",
  args: [["target-node-uuid"]]
});

// 2. 选中节点（可配合 align 命令）
await editor_request({
  channel: "selection",
  command: "select",
  args: ["node", ["target-node-uuid"]]
});
```

### 模式 3：查询并恢复视口状态

```typescript
// 保存当前状态
const tool = await editor_request({
  channel: "scene", command: "query-gizmo-tool-name", args: []
});
const pivot = await editor_request({
  channel: "scene", command: "query-gizmo-pivot", args: []
});
const coord = await editor_request({
  channel: "scene", command: "query-gizmo-coordinate", args: []
});
const is2D = await editor_request({
  channel: "scene", command: "query-is2D", args: []
});

// ... 执行操作 ...

// 恢复状态
await editor_request({ channel: "scene", command: "change-gizmo-tool", args: [tool.data.result] });
await editor_request({ channel: "scene", command: "change-gizmo-pivot", args: [pivot.data.result] });
await editor_request({ channel: "scene", command: "change-gizmo-coordinate", args: [coord.data.result] });
await editor_request({ channel: "scene", command: "change-is2D", args: [is2D.data.result] });
```
