# 02 — 节点创建、删除、复制、移动

> **通道**: `scene` | **模式**: 读写（会修改场景）

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `create-node` | 创建节点 | `[CreateNodeOptions]` |
| `remove-node` | 删除节点（支持批量） | `[RemoveNodeOptions]` |
| `duplicate-node` | 就地复制节点 | `[uuid \| uuid[]]` |
| `copy-node` | 复制到剪贴板 | `[uuid \| uuid[]]` |
| `paste-node` | 从剪贴板粘贴 | `[PasteNodeOptions]` |
| `cut-node` | 剪切到剪贴板 | `[uuid \| uuid[]]` |
| `set-parent` | 设置节点父级 | `[CutNodeOptions]` |
| `reset-node` | 重置节点属性 | `[{ uuid }]` |
| `restore-prefab` | 恢复 prefab 状态 | `[{ uuid }]` |

---

## 命令详情

### `create-node`

创建节点。

```typescript
// 参数
[{
  parent?: string,              // 父节点 UUID
  name?: string,                // 节点名称
  keepWorldTransform?: boolean, // 保持世界坐标不变
  assetUuid?: string,           // 从资源创建节点（如 prefab）
  nameIncrease?: boolean,       // 名称自增（如 Node001 → Node002）
  snapshot?: boolean,           // 是否创建 undo 快照
  type?: string,                // 资源类型
  unlinkPrefab?: boolean,       // 创建后取消 prefab 关联
  position?: { x, y, z },      // 初始位置
  canvasRequired?: boolean,     // 是否需要 Canvas
  autoAdaptToCreate?: boolean   // 根据 2D/3D 模式自适应创建
}]

// 官方类型: CreateNodeOptions
// 返回值
string  // 新节点 UUID
```

**示例：**
```typescript
// 创建空节点
editor_request({
  channel: "scene",
  command: "create-node",
  args: [{
    name: "MyNode",
    parent: "parent-uuid",
    position: { x: 0, y: 100, z: 0 }
  }]
})

// 从 prefab 资源创建节点
editor_request({
  channel: "scene",
  command: "create-node",
  args: [{
    assetUuid: "prefab-asset-uuid",
    parent: "parent-uuid"
  }]
})
```

---

### `remove-node`

删除节点（支持批量）。

```typescript
// 参数
[{
  uuid: string | string[],      // 要删除的节点 UUID（单个或数组）
  keepWorldTransform?: boolean  // 保持世界坐标不变
}]

// 官方类型: RemoveNodeOptions
// 返回值
void
```

**示例：**
```typescript
// 删除单个节点
editor_request({
  channel: "scene",
  command: "remove-node",
  args: [{ uuid: "node-uuid" }]
})

// 批量删除
editor_request({
  channel: "scene",
  command: "remove-node",
  args: [{ uuid: ["uuid1", "uuid2", "uuid3"] }]
})
```

---

### `duplicate-node`

复制节点（就地复制，新节点与原节点同级）。

```typescript
// 参数
[uuid: string | string[]]

// 返回值
string[]  // 新节点 UUID 列表
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "duplicate-node",
  args: ["node-uuid"]
})
```

---

### `copy-node`

复制节点到剪贴板。

```typescript
// 参数
[uuid: string | string[]]

// 返回值
string[]  // 被复制的 UUID 列表
```

---

### `paste-node`

粘贴节点。

```typescript
// 参数
[{
  target: string,               // 目标父节点 UUID
  uuids: string | string[],    // 被粘贴的节点 UUID
  keepWorldTransform?: boolean, // 保持世界坐标
  pasteAsChild?: boolean        // 粘贴为子节点
}]

// 官方类型: PasteNodeOptions
// 返回值
string[]  // 新节点 UUID 列表
```

---

### `cut-node`

剪切节点到剪贴板。

```typescript
// 参数
[uuid: string | string[]]

// 返回值
void
```

---

### `set-parent`

设置节点父级（移动节点到新的父节点下）。

```typescript
// 参数
[{
  parent: string,               // 目标父节点 UUID
  uuids: string | string[],    // 要移动的节点 UUID
  keepWorldTransform?: boolean  // 保持世界坐标
}]

// 官方类型: CutNodeOptions
// 返回值
string[]
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "set-parent",
  args: [{
    parent: "new-parent-uuid",
    uuids: ["child-uuid-1", "child-uuid-2"],
    keepWorldTransform: true
  }]
})
```

---

### `reset-node`

重置节点属性为默认值。

```typescript
// 参数
[{ uuid: string | string[] }]

// 官方类型: ResetNodeOptions
// 返回值
boolean
```

---

### `restore-prefab`

恢复节点的 prefab 状态（撤销本地修改，还原到 prefab 原始状态）。

```typescript
// 参数
[{ uuid: string }]

// 返回值
boolean
```

---

## 常见用法模式

### 模式 1：创建节点并设置层级

```typescript
// 1. 创建父节点
const parent = await editor_request({
  channel: "scene",
  command: "create-node",
  args: [{ name: "EnemyGroup", parent: "scene-root-uuid" }]
});

// 2. 在父节点下创建子节点
const child = await editor_request({
  channel: "scene",
  command: "create-node",
  args: [{
    name: "Enemy01",
    parent: parent.data.result,
    position: { x: 100, y: 0, z: 0 }
  }]
});
```

### 模式 2：复制节点到另一个父级

```typescript
// 1. 复制到剪贴板
await editor_request({
  channel: "scene",
  command: "copy-node",
  args: ["source-node-uuid"]
});

// 2. 粘贴到目标父级
const newNodes = await editor_request({
  channel: "scene",
  command: "paste-node",
  args: [{
    target: "target-parent-uuid",
    uuids: ["source-node-uuid"],
    pasteAsChild: true
  }]
});
```

### 模式 3：批量移动节点

```typescript
await editor_request({
  channel: "scene",
  command: "set-parent",
  args: [{
    parent: "container-uuid",
    uuids: ["node-a", "node-b", "node-c"],
    keepWorldTransform: true
  }]
});
```
