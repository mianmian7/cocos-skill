# 06 — 资源创建、修改、删除、导入

> **通道**: `asset-db` | **模式**: 读写（会修改项目资源）

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `create-asset` | 创建资源 | `[url, content, options?]` |
| `save-asset` | 保存资源内容 | `[urlOrUuid, content]` |
| `save-asset-meta` | 保存资源元数据 | `[urlOrUuid, metaJsonString]` |
| `copy-asset` | 复制资源 | `[sourceUrl, targetUrl, options?]` |
| `move-asset` | 移动/重命名资源 | `[sourceUrl, targetUrl, options?]` |
| `delete-asset` | 删除资源 | `[urlOrUuid]` |
| `refresh-asset` | 刷新资源 | `[urlOrUuid]` |
| `reimport-asset` | 重新导入资源 | `[urlOrUuid]` |
| `import-asset` | 从外部文件导入 | `[sourcePath, targetUrl, options?]` |
| `open-asset` | 在编辑器中打开 | `[urlOrUuid]` |

---

## 命令详情

### `create-asset`

创建资源。

```typescript
// 参数
[url: string, content: string | Buffer | null, options?: {
  overwrite?: boolean,  // 强制覆盖已有文件
  rename?: boolean      // 自动重命名避免冲突
}]

// 官方类型: AssetOperationOption
// 返回值
AssetInfo | null
```

**示例：**
```typescript
// 创建 JSON 配置文件
editor_request({
  channel: "asset-db",
  command: "create-asset",
  args: [
    "db://assets/configs/game-config.json",
    JSON.stringify({ version: "1.0.0", difficulty: "normal" }),
    { overwrite: false }
  ]
})

// 创建 TypeScript 脚本
editor_request({
  channel: "asset-db",
  command: "create-asset",
  args: [
    "db://assets/scripts/GameManager.ts",
    `import { _decorator, Component } from 'cc';\nconst { ccclass } = _decorator;\n\n@ccclass('GameManager')\nexport class GameManager extends Component {\n    start() {}\n}`,
    { overwrite: false }
  ]
})

// 创建空目录
editor_request({
  channel: "asset-db",
  command: "create-asset",
  args: ["db://assets/new-folder", null]
})
```

---

### `save-asset`

保存资源内容（覆盖已有内容）。

```typescript
// 参数
[urlOrUuid: string, content: string | Buffer]

// 返回值
AssetInfo | null
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "save-asset",
  args: [
    "db://assets/configs/game-config.json",
    JSON.stringify({ version: "1.1.0", difficulty: "hard" })
  ]
})
```

---

### `save-asset-meta`

保存资源元数据（导入设置等）。

```typescript
// 参数
[urlOrUuid: string, metaJsonString: string]

// 返回值
AssetInfo | null
```

> **注意：** `metaJsonString` 必须是 **JSON 字符串**格式。先用 `query-asset-meta` 获取当前 meta，修改后用 `JSON.stringify` 转回字符串。

**示例：**
```typescript
// 1. 获取当前 meta
const meta = await editor_request({
  channel: "asset-db",
  command: "query-asset-meta",
  args: ["db://assets/textures/icon.png"]
});

// 2. 修改 meta 并保存
const updatedMeta = { ...meta.result, /* 修改的字段 */ };
await editor_request({
  channel: "asset-db",
  command: "save-asset-meta",
  args: ["db://assets/textures/icon.png", JSON.stringify(updatedMeta)]
});
```

---

### `copy-asset`

复制资源。

```typescript
// 参数
[sourceUrl: string, targetUrl: string, options?: {
  overwrite?: boolean,
  rename?: boolean
}]

// 返回值
AssetInfo | null
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "copy-asset",
  args: [
    "db://assets/textures/icon.png",
    "db://assets/textures/icon-copy.png"
  ]
})
```

---

### `move-asset`

移动/重命名资源。

```typescript
// 参数
[sourceUrl: string, targetUrl: string, options?: {
  overwrite?: boolean,
  rename?: boolean
}]

// 返回值
AssetInfo | null
```

**示例：**
```typescript
// 重命名
editor_request({
  channel: "asset-db",
  command: "move-asset",
  args: [
    "db://assets/textures/old-name.png",
    "db://assets/textures/new-name.png"
  ]
})

// 移动到另一个目录
editor_request({
  channel: "asset-db",
  command: "move-asset",
  args: [
    "db://assets/textures/icon.png",
    "db://assets/ui/icons/icon.png"
  ]
})
```

---

### `delete-asset`

删除资源。

```typescript
// 参数
[urlOrUuid: string]

// 返回值
AssetInfo | null
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "delete-asset",
  args: ["db://assets/textures/unused.png"]
})
```

---

### `refresh-asset`

刷新资源（当外部文件被修改时，通知编辑器重新读取）。

```typescript
// 参数
[urlOrUuid: string]

// 返回值
void
```

---

### `reimport-asset`

重新导入资源（强制重新执行导入流程）。

```typescript
// 参数
[urlOrUuid: string]

// 返回值
void
```

---

### `import-asset`

从外部文件系统导入资源到项目中。

```typescript
// 参数
[sourcePath: string, targetUrl: string, options?: {
  overwrite?: boolean,
  rename?: boolean
}]

// 返回值
AssetInfo | null
```

**示例：**
```typescript
// 从文件系统导入图片
editor_request({
  channel: "asset-db",
  command: "import-asset",
  args: [
    "/Users/dev/Downloads/texture.png",
    "db://assets/textures/imported-texture.png"
  ]
})
```

---

### `open-asset`

在默认编辑器中打开资源。

```typescript
// 参数
[urlOrUuid: string]

// 返回值
void
```

---

## 常见用法模式

### 模式 1：创建脚本并刷新

```typescript
// 1. 创建脚本文件
await editor_request({
  channel: "asset-db",
  command: "create-asset",
  args: [
    "db://assets/scripts/EnemyAI.ts",
    scriptContent,
    { overwrite: false }
  ]
});

// 2. 等待导入完成后刷新
await editor_request({
  channel: "asset-db",
  command: "refresh-asset",
  args: ["db://assets/scripts/EnemyAI.ts"]
});
```

### 模式 2：安全覆盖资源

```typescript
// 先查询是否存在
const info = await editor_request({
  channel: "asset-db",
  command: "query-asset-info",
  args: ["db://assets/configs/settings.json"]
});

if (info.result) {
  // 存在则保存
  await editor_request({
    channel: "asset-db",
    command: "save-asset",
    args: ["db://assets/configs/settings.json", newContent]
  });
} else {
  // 不存在则创建
  await editor_request({
    channel: "asset-db",
    command: "create-asset",
    args: ["db://assets/configs/settings.json", newContent]
  });
}
```

### 模式 3：批量整理资源目录

```typescript
// 创建目标目录
await editor_request({
  channel: "asset-db",
  command: "create-asset",
  args: ["db://assets/organized/textures", null]
});

// 移动资源到新目录
await editor_request({
  channel: "asset-db",
  command: "move-asset",
  args: [
    "db://assets/scattered-texture.png",
    "db://assets/organized/textures/scattered-texture.png"
  ]
});
```
