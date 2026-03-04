# 04 — 组件增删查 + 类型发现

> **通道**: `scene` | **模式**: 读写

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `create-component` | 为节点添加组件 | `[CreateComponentOptions]` |
| `remove-component` | 移除组件 | `[RemoveComponentOptions]` |
| `reset-component` | 重置组件为默认值 | `[{ uuid }]` |
| `query-component` | 查询单个组件 dump | `[componentUuid]` |
| `query-components` | 列出所有已注册组件类型 | `[]` |
| `query-classes` | 查询可用组件类（可过滤） | `[QueryClassesOptions]` |
| `query-component-has-script` | 组件是否关联脚本 | `[componentCid]` |

---

## 命令详情

### `create-component`

为节点添加组件。

```typescript
// 参数
[{
  uuid: string,      // 节点 UUID
  component: string  // 组件类名（如 "cc.Sprite", "cc.Label"）
}]

// 官方类型: CreateComponentOptions
// 返回值
void
```

**示例：**
```typescript
// 添加 Sprite 组件
editor_request({
  channel: "scene",
  command: "create-component",
  args: [{ uuid: "node-uuid", component: "cc.Sprite" }]
})

// 添加自定义脚本组件
editor_request({
  channel: "scene",
  command: "create-component",
  args: [{ uuid: "node-uuid", component: "PlayerController" }]
})
```

---

### `remove-component`

移除组件。

```typescript
// 参数
[{
  uuid: string  // ⚠️ 组件的 UUID（不是节点 UUID）
}]

// 官方类型: RemoveComponentOptions
// 返回值
void
```

> **注意：** 这里的 `uuid` 是**组件的 UUID**，不是节点的 UUID。先用 `query-node` 获取节点 dump，从 `__comps__` 数组中找到目标组件的 UUID。

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "remove-component",
  args: [{ uuid: "component-uuid" }]
})
```

---

### `reset-component`

重置组件属性为默认值。

```typescript
// 参数
[{ uuid: string }]  // 组件 UUID

// 官方类型: ResetComponentOptions
// 返回值
void
```

---

### `query-component`

查询单个组件的完整 dump 数据。

```typescript
// 参数
[componentUuid: string]

// 返回值
IComponent  // 组件完整数据，包括所有属性
```

---

### `query-components`

列出所有已注册的组件类型信息。

```typescript
// 参数
[]

// 返回值
{ name: string, cid: string, path: string, assetUuid: string }[]
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "query-components",
  args: []
})
```

---

### `query-classes`

查询可用的组件类（可按基类过滤）。

```typescript
// 参数
[{
  extends?: string | string[],  // 基类过滤
  excludeSelf?: boolean         // 是否排除自身
}]

// 官方类型: QueryClassesOptions
// 返回值
{ name: string }[]
```

**示例：**
```typescript
// 查询所有继承自 cc.Component 的类
editor_request({
  channel: "scene",
  command: "query-classes",
  args: [{ extends: "cc.Component" }]
})

// 查询所有 Renderer 类
editor_request({
  channel: "scene",
  command: "query-classes",
  args: [{ extends: "cc.Renderer", excludeSelf: true }]
})
```

---

### `query-component-has-script`

查询组件是否有关联的脚本文件。

```typescript
// 参数
[componentCid: string]

// 返回值
boolean
```

---

## 常见用法模式

### 模式 1：创建节点并添加多个组件

```typescript
// 1. 创建节点
const result = await editor_request({
  channel: "scene",
  command: "create-node",
  args: [{ name: "Player", parent: "scene-root-uuid" }]
});
const nodeUuid = result.result;

// 2. 添加 Sprite 组件
await editor_request({
  channel: "scene",
  command: "create-component",
  args: [{ uuid: nodeUuid, component: "cc.Sprite" }]
});

// 3. 添加 Animation 组件
await editor_request({
  channel: "scene",
  command: "create-component",
  args: [{ uuid: nodeUuid, component: "cc.Animation" }]
});
```

### 模式 2：查找并移除指定类型组件

```typescript
// 1. 查询节点的完整 dump
const node = await editor_request({
  channel: "scene",
  command: "query-node",
  args: ["node-uuid"]
});

// 2. 从 dump 中找到 RigidBody 组件的 UUID
// node.__comps__ 是组件数组，每个组件有 type 和 value.uuid
// 3. 移除该组件
await editor_request({
  channel: "scene",
  command: "remove-component",
  args: [{ uuid: "found-component-uuid" }]
});
```

### 模式 3：发现项目中可用的组件类型

```typescript
// 查询所有可用组件类型
const allComponents = await editor_request({
  channel: "scene",
  command: "query-components",
  args: []
});

// 查询特定基类的子类
const renderers = await editor_request({
  channel: "scene",
  command: "query-classes",
  args: [{ extends: "cc.UIRenderer" }]
});
```
