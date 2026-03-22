# 07 — 场景打开/保存/关闭 + Undo

> **通道**: `scene` | **模式**: 读写（会影响场景状态）

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `open-scene` | 打开场景 | `[sceneAssetUuid]` |
| `save-scene` | 保存当前场景 | `[]` 或 `[saveAs?]` |
| `save-as-scene` | 另存为场景 | `[]` |
| `close-scene` | 关闭当前场景 | `[]` |
| `snapshot` | 创建 Undo 快照 | `[]` |
| `snapshot-abort` | 取消 Undo 快照 | `[]` |
| `soft-reload` | 软重载场景 | `[]` |

---

## 命令详情

### `open-scene`

打开场景。传入场景资源的 UUID。

```typescript
// 参数
[sceneAssetUuid: string]

// 返回值
void
```

**示例：**
```typescript
// 先查询场景 UUID
const sceneInfo = await editor_request({
  channel: "asset-db",
  command: "query-uuid",
  args: ["db://assets/scenes/MainMenu.scene"]
});

// 打开场景
editor_request({
  channel: "scene",
  command: "open-scene",
  args: [sceneInfo.data.result]
})
```

---

### `save-scene`

保存当前场景。

```typescript
// 参数
[] | [saveAs?: boolean]

// 返回值
string | undefined  // 场景资源路径（保存成功时返回）
```

**示例：**
```typescript
// 普通保存
editor_request({
  channel: "scene",
  command: "save-scene",
  args: []
})

// 另存为（等同于 save-as-scene）
editor_request({
  channel: "scene",
  command: "save-scene",
  args: [true]
})
```

---

### `save-as-scene`

另存为场景（会弹出文件选择对话框）。

```typescript
// 参数
[]

// 返回值
string | undefined  // 新场景资源路径
```

---

### `close-scene`

关闭当前场景。

```typescript
// 参数
[]

// 返回值
boolean
```

---

### `snapshot`

创建 Undo 快照。在执行一组修改操作前调用，配合 `snapshot-abort` 可以实现原子性回滚。

```typescript
// 参数
[]

// 返回值
void
```

> **最佳实践：** 在批量修改前调用 `snapshot`，这样用户可以用 Ctrl+Z 一步撤销所有修改。

---

### `snapshot-abort`

取消 Undo 快照（丢弃自上次 snapshot 以来的所有更改）。

```typescript
// 参数
[]

// 返回值
void
```

---

### `soft-reload`

软重载场景（不重新加载资源，只刷新场景状态）。

```typescript
// 参数
[]

// 返回值
void
```

---

## 常见用法模式

### 模式 1：安全修改场景（带 Undo 支持）

```typescript
// 1. 创建快照点
await editor_request({
  channel: "scene",
  command: "snapshot",
  args: []
});

// 2. 执行一系列修改
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{ uuid: "node-1", path: "position", dump: { type: "cc.Vec3", value: { x: 100, y: 0, z: 0 } } }]
});

await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{ uuid: "node-2", path: "active", dump: { type: "Boolean", value: false } }]
});

// 用户可以通过 Ctrl+Z 一步撤销以上所有修改
```

### 模式 2：切换场景

```typescript
// 1. 检查当前场景是否需要保存
const dirty = await editor_request({
  channel: "scene",
  command: "query-dirty",
  args: []
});

// 2. 如有修改先保存
if (dirty.data.result) {
  await editor_request({
    channel: "scene",
    command: "save-scene",
    args: []
  });
}

// 3. 获取目标场景 UUID
const targetScene = await editor_request({
  channel: "asset-db",
  command: "query-uuid",
  args: ["db://assets/scenes/GameLevel1.scene"]
});

// 4. 打开新场景
await editor_request({
  channel: "scene",
  command: "open-scene",
  args: [targetScene.data.result]
});
```

### 模式 3：修改失败时回滚

```typescript
// 1. 创建快照
await editor_request({
  channel: "scene",
  command: "snapshot",
  args: []
});

try {
  // 2. 执行修改...
  // (如果出错)
} catch (error) {
  // 3. 取消快照，回滚所有更改
  await editor_request({
    channel: "scene",
    command: "snapshot-abort",
    args: []
  });
}
```
