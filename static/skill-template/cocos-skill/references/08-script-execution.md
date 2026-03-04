# 08 — 脚本执行与组件方法调用

> **通道**: `scene` | **模式**: 执行（可产生任意副作用）

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `execute-scene-script` | 执行场景脚本方法 | `[ExecuteSceneScriptMethodOptions]` |
| `execute-component-method` | 执行组件方法 | `[ExecuteComponentMethodOptions]` |

---

## 命令详情

### `execute-scene-script`

在场景上下文中执行注册的脚本方法。脚本需要通过 Cocos Creator 的场景脚本机制注册。

```typescript
// 参数
[{
  name: string,   // 脚本名称（在 contributions.scene.script 中注册的）
  method: string, // 方法名
  args: any[]     // 参数数组
}]

// 官方类型: ExecuteSceneScriptMethodOptions
// 返回值
any  // 方法返回值
```

**示例：**
```typescript
editor_request({
  channel: "scene",
  command: "execute-scene-script",
  args: [{
    name: "cocos-skill",
    method: "queryNodeWorldPosition",
    args: ["node-uuid"]
  }]
})
```

---

### `execute-component-method`

直接在指定组件实例上调用方法。

```typescript
// 参数
[{
  uuid: string,   // 组件 UUID（不是节点 UUID）
  name: string,   // 方法名
  args: any[]     // 参数数组
}]

// 官方类型: ExecuteComponentMethodOptions
// 返回值
any  // 方法返回值
```

**示例：**
```typescript
// 调用组件上的自定义方法
editor_request({
  channel: "scene",
  command: "execute-component-method",
  args: [{
    uuid: "component-uuid",
    name: "resetHealth",
    args: [100]
  }]
})
```

> **注意：** `uuid` 必须是**组件的 UUID**，不是节点的 UUID。先用 `query-node` 获取节点 dump，从 `__comps__` 中找到目标组件的 UUID。

---

## 常见用法模式

### 模式 1：通过场景脚本查询运行时数据

```typescript
// 场景脚本可以访问场景中的运行时对象
const result = await editor_request({
  channel: "scene",
  command: "execute-scene-script",
  args: [{
    name: "cocos-skill",
    method: "getSceneInfo",
    args: []
  }]
});
```

### 模式 2：调用组件方法修改游戏状态

```typescript
// 1. 查询节点获取组件 UUID
const node = await editor_request({
  channel: "scene",
  command: "query-node",
  args: ["player-node-uuid"]
});

// 2. 从 dump 中找到目标组件的 UUID
// （假设已从 node.__comps__ 中提取到 component UUID）

// 3. 调用组件方法
await editor_request({
  channel: "scene",
  command: "execute-component-method",
  args: [{
    uuid: "player-controller-component-uuid",
    name: "setSpeed",
    args: [10.0]
  }]
});
```

### 模式 3：批量执行场景脚本操作

```typescript
// 使用场景脚本执行复杂的批量操作
const results = await editor_request({
  channel: "scene",
  command: "execute-scene-script",
  args: [{
    name: "cocos-skill",
    method: "batchUpdateNodes",
    args: [
      ["uuid-1", "uuid-2", "uuid-3"],
      { visible: false }
    ]
  }]
});
```
