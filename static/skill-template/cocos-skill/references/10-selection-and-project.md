# 10 — 选择操作 + 项目配置

> **通道**: `selection` + `project` | **模式**: 读写

## 命令一览

### Selection 通道

| 命令 | 说明 | 参数 |
|------|------|------|
| `select` | 选择节点或资源 | `[type, uuids[]]` |
| `unselect` | 取消选择 | `[type, uuids[]]` |
| `clear` | 清除所有选择 | `[type]` |

### Project 通道

| 命令 | 说明 | 参数 |
|------|------|------|
| `query-config` | 查询项目配置 | `[protocol, key?]` |
| `set-config` | 设置项目配置 | `[protocol, key, value]` |
| `open-settings` | 打开设置面板 | `[tab, section, ...args]` |

---

## Selection 命令详情

### `select`

选择节点或资源。

```typescript
// 参数
[type: "node" | "asset", uuids: string[]]

// 返回值
void
```

**示例：**
```typescript
// 选择节点
editor_request({
  channel: "selection",
  command: "select",
  args: ["node", ["node-uuid-1", "node-uuid-2"]]
})

// 选择资源
editor_request({
  channel: "selection",
  command: "select",
  args: ["asset", ["asset-uuid"]]
})
```

---

### `unselect`

取消选择指定的节点或资源。

```typescript
// 参数
[type: "node" | "asset", uuids: string[]]

// 返回值
void
```

**示例：**
```typescript
editor_request({
  channel: "selection",
  command: "unselect",
  args: ["node", ["node-uuid"]]
})
```

---

### `clear`

清除所有选择。

```typescript
// 参数
[type: "node" | "asset"]

// 返回值
void
```

**示例：**
```typescript
// 清除所有节点选择
editor_request({
  channel: "selection",
  command: "clear",
  args: ["node"]
})
```

---

## Project 命令详情

### `query-config`

查询项目配置。

```typescript
// 参数
[protocol: string, key?: string]

// 返回值
any
```

**常用 protocol：**

| Protocol | 说明 |
|----------|------|
| `project` | 项目设置 |
| `builder` | 构建设置 |
| `preferences` | 偏好设置 |

**示例：**
```typescript
// 查询所有项目设置
editor_request({
  channel: "project",
  command: "query-config",
  args: ["project"]
})

// 查询特定配置项
editor_request({
  channel: "project",
  command: "query-config",
  args: ["project", "scripts"]
})
```

---

### `set-config`

设置项目配置。

```typescript
// 参数
[protocol: string, key: string, value: any]

// 返回值
boolean
```

**示例：**
```typescript
editor_request({
  channel: "project",
  command: "set-config",
  args: ["project", "scripts", { scriptBundleName: "main" }]
})
```

---

### `open-settings`

打开项目设置面板。

```typescript
// 参数
[tab: string, section: string, ...args: any[]]

// 返回值
void
```

**示例：**
```typescript
// 打开项目设置
editor_request({
  channel: "project",
  command: "open-settings",
  args: ["project", "general"]
})
```

---

## 常见用法模式

### 模式 1：选择节点后聚焦

```typescript
// 1. 选择节点
await editor_request({
  channel: "selection",
  command: "select",
  args: ["node", ["target-uuid"]]
});

// 2. 聚焦摄像机（配合 09-viewport-gizmo.md）
await editor_request({
  channel: "scene",
  command: "focus-camera",
  args: [["target-uuid"]]
});
```

### 模式 2：查询并修改项目配置

```typescript
// 1. 查询当前配置
const config = await editor_request({
  channel: "project",
  command: "query-config",
  args: ["project"]
});

// 2. 修改配置
await editor_request({
  channel: "project",
  command: "set-config",
  args: ["project", "scripts", updatedValue]
});
```

### 模式 3：清除选择后重新选择

```typescript
// 1. 清除所有节点选择
await editor_request({
  channel: "selection",
  command: "clear",
  args: ["node"]
});

// 2. 选择新的节点
await editor_request({
  channel: "selection",
  command: "select",
  args: ["node", ["new-node-uuid"]]
});
```
