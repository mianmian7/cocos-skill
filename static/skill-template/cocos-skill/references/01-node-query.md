# 01 — 节点查询与检视

> **通道**: `scene` | **模式**: 只读

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `query-node` | 查询单个节点完整 dump | `[uuid]` |
| `query-node-tree` | 查询节点树结构 | `[]` 或 `[rootUuid]` |
| `query-nodes-by-asset-uuid` | 查找使用指定资源的节点 | `[assetUuid]` |
| `query-dirty` | 场景是否有未保存更改 | `[]` |
| `query-is-ready` | 场景编辑器是否就绪 | `[]` |
| `query-scene-bounds` | 查询场景边界尺寸 | `[]` |

---

## 命令详情

### `query-node`

查询单个节点的完整 dump 数据。

```typescript
// 参数
[uuid: string]

// 返回值
INode  // 包含节点名称、transform、组件列表、子节点等完整信息
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-node",
  args: ["abc123-node-uuid"]
})
```

---

### `query-node-tree`

查询节点树结构。不传参数则返回整个场景树。

```typescript
// 参数
[] | [rootUuid?: string]

// 返回值
INode  // 树形结构，包含子节点
```

**示例：**
```typescript
// 查询整个场景树
editor_request({
  channel: "scene",
  command: "query-node-tree",
  args: [],
  maxDepth: 3,
  maxNodes: 50
})

// 查询指定节点的子树
editor_request({
  channel: "scene",
  command: "query-node-tree",
  args: ["parent-node-uuid"]
})
```

---

### `query-nodes-by-asset-uuid`

查找使用指定资源的所有节点 UUID。

```typescript
// 参数
[assetUuid: string]

// 返回值
string[]  // 使用该资源的节点 UUID 列表
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-nodes-by-asset-uuid",
  args: ["image-asset-uuid"]
})
```

---

### `query-dirty`

检查当前场景是否有未保存的更改。

```typescript
// 参数
[]

// 返回值
boolean
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-dirty",
  args: []
})
```

---

### `query-is-ready`

检查场景编辑器是否已就绪。在执行任何场景操作前建议先调用此命令。

```typescript
// 参数
[]

// 返回值
boolean
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-is-ready",
  args: []
})
```

---

### `query-scene-bounds`

查询场景边界尺寸。

```typescript
// 参数
[]

// 返回值
{ x: number, y: number, width: number, height: number }
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-scene-bounds",
  args: []
})
```

---

## 常见用法模式

### 模式 1：检查场景状态后查询节点

```typescript
// 1. 确认场景就绪
const ready = await editor_request({
  channel: "scene", command: "query-is-ready", args: []
});

// 2. 获取场景树
const tree = await editor_request({
  channel: "scene",
  command: "query-node-tree",
  args: [],
  maxDepth: 2,
  maxNodes: 100
});

// 3. 查询具体节点详情
const node = await editor_request({
  channel: "scene",
  command: "query-node",
  args: ["target-uuid"]
});
```

### 模式 2：查找使用某资源的所有节点

```typescript
// 1. 查找引用该图片的节点
const nodeUuids = await editor_request({
  channel: "scene",
  command: "query-nodes-by-asset-uuid",
  args: ["texture-uuid"]
});

// 2. 逐个查询详情
for (const uuid of nodeUuids.data.result) {
  const detail = await editor_request({
    channel: "scene",
    command: "query-node",
    args: [uuid]
  });
}
```

### 模式 3：检查是否需要保存

```typescript
const dirty = await editor_request({
  channel: "scene",
  command: "query-dirty",
  args: []
});
if (dirty.data.result) {
  // 场景有未保存更改，提示用户或自动保存
}
```
