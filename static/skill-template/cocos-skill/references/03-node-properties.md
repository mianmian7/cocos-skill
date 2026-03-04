# 03 — 节点属性读写

> **通道**: `scene` | **模式**: 读写

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `set-property` | 设置节点/组件属性值 | `[SetPropertyOptions]` |
| `reset-property` | 重置属性为默认值 | `[SetPropertyOptions]` |
| `move-array-element` | 移动数组元素位置 | `[MoveArrayOptions]` |
| `remove-array-element` | 移除数组元素 | `[RemoveArrayOptions]` |

---

## 命令详情

### `set-property`

设置节点/组件属性值。这是最常用的属性修改命令。

```typescript
// 参数
[{
  uuid: string,     // 节点或组件的 UUID
  path: string,     // 属性路径（见下方路径表）
  dump: {           // 属性 dump 数据
    type: string,   // 值类型（见下方类型表）
    value: any      // 具体值
  }
}]

// 官方类型: SetPropertyOptions
// 返回值
boolean
```

**示例：**
```typescript
// 设置位置
editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "position",
    dump: { type: "cc.Vec3", value: { x: 100, y: 200, z: 0 } }
  }]
})

// 设置节点名称
editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "name",
    dump: { type: "String", value: "NewName" }
  }]
})

// 设置组件颜色
editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "__comps__.0.color",
    dump: { type: "cc.Color", value: { r: 255, g: 0, b: 0, a: 255 } }
  }]
})
```

---

### `reset-property`

重置属性为默认值。

```typescript
// 参数
[{
  uuid: string,
  path: string,
  dump: IProperty  // 属性的 dump 数据
}]

// 官方类型: SetPropertyOptions
// 返回值
boolean
```

---

### `move-array-element`

移动数组元素位置（调整顺序）。

```typescript
// 参数
[{
  uuid: string,    // 节点或组件 UUID
  path: string,    // 数组属性路径
  target: number,  // 元素当前索引
  offset: number   // 移动偏移量（正数向后，负数向前）
}]

// 官方类型: MoveArrayOptions
// 返回值
boolean
```

**示例：**
```typescript
// 将第 0 个元素移到第 2 个位置
editor_request({
  channel: "scene",
  command: "move-array-element",
  args: [{
    uuid: "node-uuid",
    path: "__comps__",
    target: 0,
    offset: 2
  }]
})
```

---

### `remove-array-element`

移除数组元素。

```typescript
// 参数
[{
  uuid: string,
  path: string,
  index: number  // 要移除的元素索引
}]

// 官方类型: RemoveArrayOptions
// 返回值
boolean
```

---

## 属性路径表

### 节点基础属性

| 路径 | 说明 | Dump Type | 值格式 |
|------|------|-----------|--------|
| `position` | 位置 | `cc.Vec3` | `{ x, y, z }` |
| `scale` | 缩放 | `cc.Vec3` | `{ x, y, z }` |
| `rotation` | 四元数旋转 | `cc.Quat` | `{ x, y, z, w }` |
| `eulerAngles` | 欧拉角旋转 | `cc.Vec3` | `{ x, y, z }` |
| `active` | 激活状态 | `Boolean` | `true` / `false` |
| `name` | 节点名称 | `String` | `"NodeName"` |
| `layer` | 层级 | `Number` | `33554432` |
| `mobility` | 移动性 | `Number` | `0`(Static) / `1`(Stationary) / `2`(Movable) |

### 组件属性路径

组件属性使用 `__comps__.{index}.{property}` 路径格式，其中 `index` 是组件在节点组件列表中的位置。

| 路径 | 说明 | Dump Type | 值格式 |
|------|------|-----------|--------|
| `__comps__.0.enabled` | 第一个组件的启用状态 | `Boolean` | `true` / `false` |
| `__comps__.0.color` | Sprite 颜色 | `cc.Color` | `{ r, g, b, a }` |
| `__comps__.0.string` | Label 文本 | `String` | `"Hello"` |
| `__comps__.0.fontSize` | Label 字号 | `Number` | `24` |
| `__comps__.0.spriteFrame` | Sprite 帧引用 | `cc.SpriteFrame` | `{ uuid: "asset-uuid" }` |
| `__comps__.0.sizeMode` | Sprite 尺寸模式 | `Number` | `0`(Custom) / `1`(Trimmed) / `2`(Raw) |

---

## 值类型定义

### `cc.Vec3`

```typescript
{ x: number, y: number, z: number }
```

### `cc.Vec2`

```typescript
{ x: number, y: number }
```

### `cc.Color`

```typescript
{
  r: number,  // 0-255
  g: number,  // 0-255
  b: number,  // 0-255
  a: number   // 0-255
}
```

### `cc.Size`

```typescript
{ width: number, height: number }
```

### `cc.Quat`

```typescript
{ x: number, y: number, z: number, w: number }
```

### 资源引用

```typescript
{ uuid: "asset-uuid-string" }
```

### `IProperty` (Dump 数据格式)

```typescript
interface IProperty {
  value: any;           // 属性值
  type?: string;        // 类型标识
  readonly?: boolean;   // 是否只读
  visible?: boolean;    // 是否可见
}
```

---

## 常见用法模式

### 模式 1：修改节点 Transform

```typescript
// 设置位置
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "position",
    dump: { type: "cc.Vec3", value: { x: 100, y: 200, z: 0 } }
  }]
});

// 设置缩放
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "scale",
    dump: { type: "cc.Vec3", value: { x: 2, y: 2, z: 1 } }
  }]
});

// 设置旋转（欧拉角）
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "eulerAngles",
    dump: { type: "cc.Vec3", value: { x: 0, y: 45, z: 0 } }
  }]
});
```

### 模式 2：修改组件属性

```typescript
// 修改 Label 文本
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "__comps__.0.string",
    dump: { type: "String", value: "New Text" }
  }]
});

// 修改 Sprite 引用的图片
await editor_request({
  channel: "scene",
  command: "set-property",
  args: [{
    uuid: "node-uuid",
    path: "__comps__.0.spriteFrame",
    dump: { type: "cc.SpriteFrame", value: { uuid: "sprite-frame-uuid" } }
  }]
});
```

### 模式 3：批量设置节点为不可见

```typescript
const uuids = ["node-1", "node-2", "node-3"];
for (const uuid of uuids) {
  await editor_request({
    channel: "scene",
    command: "set-property",
    args: [{
      uuid,
      path: "active",
      dump: { type: "Boolean", value: false }
    }]
  });
}
```
