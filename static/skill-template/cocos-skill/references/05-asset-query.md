# 05 — 资源查询与依赖分析

> **通道**: `asset-db` | **模式**: 只读

## 命令一览

| 命令 | 说明 | 参数 |
|------|------|------|
| `query-asset-info` | 查询资源信息 | `[urlOrUuidOrPath, dataKeys?]` |
| `query-asset-meta` | 查询资源元数据 | `[urlOrUuid]` |
| `query-assets` | 批量查询资源 | `[QueryAssetsOption?, dataKeys?]` |
| `query-path` | 获取资源绝对路径 | `[uuid]` |
| `query-url` | 获取资源 URL | `[uuid]` |
| `query-uuid` | 从 URL/路径获取 UUID | `[urlOrPath]` |
| `query-asset-users` | 查找使用该资源的资源 | `[uuidOrUrl, type?]` |
| `query-asset-dependencies` | 查询资源依赖 | `[uuidOrUrl, type?]` |
| `query-ready` | 资源数据库是否就绪 | `[]` |
| `generate-available-url` | 生成不冲突的 URL | `[url]` |

---

## 命令详情

### `query-asset-info`

查询资源信息。支持 URL、UUID 或路径作为参数。

```typescript
// 参数
[urlOrUuidOrPath: string, dataKeys?: string[]]

// 返回值
AssetInfo | null
```

**dataKeys 可选值：**
`name`, `source`, `path`, `url`, `file`, `uuid`, `importer`, `type`, `isDirectory`, `library`, `subAssets`, `visible`, `readonly`, `imported`, `invalid`, `extends`, `mtime`, `depends`, `dependeds`

**示例：**
```typescript
// 查询完整信息
editor_request({
  channel: "asset-db",
  command: "query-asset-info",
  args: ["db://assets/textures/icon.png"]
})

// 只查询特定字段（更快）
editor_request({
  channel: "asset-db",
  command: "query-asset-info",
  args: ["db://assets/textures/icon.png", ["uuid", "type", "path"]]
})
```

---

### `query-asset-meta`

查询资源元数据（导入设置等）。

```typescript
// 参数
[urlOrUuid: string]

// 返回值
IAssetMeta | null
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "query-asset-meta",
  args: ["db://assets/textures/icon.png"]
})
```

---

### `query-assets`

批量查询资源。支持按类型、扩展名、路径模式等过滤。

```typescript
// 参数
[options?: {
  ccType?: string | string[],    // 资源类型，如 'cc.ImageAsset'
  isBundle?: boolean,            // 筛选 asset bundle
  importer?: string | string[],  // 导入器名称
  pattern?: string,              // 路径匹配 (globs)
  extname?: string | string[],   // 扩展名
  userData?: Record<string, any> // 自定义 userData 过滤
}, dataKeys?: (keyof AssetInfo)[]]

// 官方类型: QueryAssetsOption
// 返回值
AssetInfo[]
```

**示例：**
```typescript
// 查询所有图片资源
editor_request({
  channel: "asset-db",
  command: "query-assets",
  args: [{ ccType: "cc.ImageAsset" }]
})

// 查询特定目录下的 prefab
editor_request({
  channel: "asset-db",
  command: "query-assets",
  args: [{ pattern: "db://assets/prefabs/**", extname: ".prefab" }]
})

// 查询所有脚本文件
editor_request({
  channel: "asset-db",
  command: "query-assets",
  args: [{ extname: [".ts", ".js"] }]
})
```

---

### `query-path`

查询资源的文件系统绝对路径。

```typescript
// 参数
[uuid: string]

// 返回值
string | null
```

---

### `query-url`

查询资源 URL（如 `db://assets/...`）。

```typescript
// 参数
[uuid: string]

// 返回值
string | null
```

---

### `query-uuid`

从 URL 或路径获取资源 UUID。

```typescript
// 参数
[urlOrPath: string]

// 返回值
string | null
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "query-uuid",
  args: ["db://assets/textures/icon.png"]
})
```

---

### `query-asset-users`

查询哪些资源/脚本使用了指定资源（反向依赖）。

```typescript
// 参数
[uuidOrUrl: string, type?: "asset" | "script" | "all"]

// 返回值
string[]  // UUID 列表
```

**示例：**
```typescript
// 查询哪些资源引用了此图片
editor_request({
  channel: "asset-db",
  command: "query-asset-users",
  args: ["image-uuid", "asset"]
})
```

---

### `query-asset-dependencies`

查询资源依赖的其他资源/脚本（正向依赖）。

```typescript
// 参数
[uuidOrUrl: string, type?: "asset" | "script" | "all"]

// 返回值
string[]  // UUID 列表
```

**示例：**
```typescript
// 查询 prefab 的所有依赖
editor_request({
  channel: "asset-db",
  command: "query-asset-dependencies",
  args: ["prefab-uuid", "all"]
})
```

---

### `query-ready`

检查资源数据库是否就绪。

```typescript
// 参数
[]

// 返回值
boolean
```

---

### `generate-available-url`

生成可用的资源 URL（自动避免命名冲突）。

```typescript
// 参数
[url: string]

// 返回值
string  // 可用的 URL（如有冲突会自动添加后缀）
```

**示例：**
```typescript
editor_request({
  channel: "asset-db",
  command: "generate-available-url",
  args: ["db://assets/textures/icon.png"]
})
// 如果 icon.png 已存在，可能返回 "db://assets/textures/icon_001.png"
```

---

## AssetInfo 类型定义

```typescript
interface AssetInfo {
  name: string;         // 资源名称
  displayName: string;  // 显示名称
  source: string;       // URL 地址
  path: string;         // 加载路径
  url: string;          // 完整 URL
  file: string;         // 绝对路径
  uuid: string;         // 唯一 ID
  importer: string;     // 导入器名称
  type: string;         // 类型（如 "cc.ImageAsset"）
  isDirectory: boolean; // 是否为目录
  library: Record<string, string>;
  subAssets: Record<string, AssetInfo>;
  visible: boolean;
  readonly: boolean;
  imported: boolean;
  invalid: boolean;
  extends?: string[];
}
```

---

## 常见用法模式

### 模式 1：查找并分析资源依赖关系

```typescript
// 1. 通过 URL 获取 UUID
const uuid = await editor_request({
  channel: "asset-db",
  command: "query-uuid",
  args: ["db://assets/prefabs/Player.prefab"]
});

// 2. 查询该 prefab 依赖了哪些资源
const deps = await editor_request({
  channel: "asset-db",
  command: "query-asset-dependencies",
  args: [uuid.data.result, "all"]
});

// 3. 查询哪些资源引用了这个 prefab
const users = await editor_request({
  channel: "asset-db",
  command: "query-asset-users",
  args: [uuid.data.result, "asset"]
});
```

### 模式 2：遍历项目中的特定类型资源

```typescript
// 查询所有场景文件
const scenes = await editor_request({
  channel: "asset-db",
  command: "query-assets",
  args: [{ extname: ".scene" }, ["name", "url", "uuid"]]
});

// 查询特定目录下的所有资源
const assets = await editor_request({
  channel: "asset-db",
  command: "query-assets",
  args: [{ pattern: "db://assets/ui/**" }]
});
```

### 模式 3：安全创建资源前检查

```typescript
// 先生成不冲突的 URL
const url = await editor_request({
  channel: "asset-db",
  command: "generate-available-url",
  args: ["db://assets/scripts/GameManager.ts"]
});
// 然后用返回的 URL 创建资源（见 06-asset-crud.md）
```
