# Cocos Creator AI Skill

> 默认文档语言：中文  
> English version: [README.en.md](README.en.md)

`cocos-skill` 是一个 Cocos Creator 扩展，用于在编辑器内启动 HTTP 工具服务器，支持 AI 辅助游戏开发。

## 提供能力

- 在 `/skill/*` 下提供 HTTP API，用于场景、资源与项目操作
- 复用 `source/skill/tools/` 下已注册的 19 个工具
- 支持自动启动，并在 `Editor.Profile` (`cocos-skill.server-config`) 中持久化服务配置
- 生成项目根配置文件：`.cocos-skill-config.json`（包含 `port` 与 `baseUrl`）
- 扩展加载时自动创建 Skill 目录：
  - `.claude/skills/`
  - `.codex/skills/`
  - `.agent/skills/`
- 扩展加载时自动同步内置 skill 模板：
  - `.claude/skills/cocos-skill/SKILL.md`
  - `.codex/skills/cocos-skill/SKILL.md`
  - `.agent/skills/cocos-skill/SKILL.md`
  - `SKILL.md` 的受管主体会自动更新，同时保留项目本地 `Project Notes` 备注块
  - `references/*` 等模板文件会按 bundled 版本刷新
  - 模板来源：`static/skill-template/cocos-skill/`

## 不会生成的内容

- 不会生成旧版协议配置文件
- 当前仓库不包含旧版 Python CLI 脚本
- Skill 模板引导不依赖外部安装器

## Skill 模板维护参考

- 这一节只用于维护 `static/skill-template/cocos-skill/` 时追溯来源，不会同步进打包后的 skill 内容。
- 根目录 `@cocos/` 目前是本地参考副本；当前 `.gitignore` 忽略它，默认 `npm run package` 也不会把它放进发布 zip。

| 模板主题 | 维护期核对来源 |
|---|---|
| `references/01` `02` `03` `04` `07` `08` `09` | `@cocos/creator-types/editor/packages/scene/@types/message.d.ts`；涉及 option / dump 结构时再看 `@cocos/creator-types/editor/packages/scene/@types/public.d.ts` |
| `references/05` `06` | `@cocos/creator-types/editor/packages/asset-db/@types/message.d.ts`；涉及 `QueryAssetsOption` / `AssetOperationOption` / `IAssetInfo` 时再看 `@cocos/creator-types/editor/packages/asset-db/@types/public.d.ts` |
| `references/10` | `selection` 看 `@cocos/creator-types/editor/editor.d.ts` 里的 `Editor.Selection`；`project` 看 `@cocos/creator-types/editor/packages/project/@types/message.d.ts` 与 `index.d.ts`；`preferences` 看 `@cocos/creator-types/editor/packages/preferences/@types/message.d.ts` 与 `index.d.ts` |
| `references/11` | 仓库内工具实现：`source/skill/tools/get-node-definitions.ts`、`source/skill/tools/get-component-definitions.ts` |
| `editor_request` 白名单与运行时适配 | `source/skill/tools/editor-request-schemas.ts`、`source/skill/tools/editor-request-support.ts` |

## 快速开始

1. 在 Cocos Creator 中安装本扩展。
2. 等待扩展加载完成；HTTP 服务会在后台自动启动（默认 `autoStart: true`）。
3. 使用以下命令验证：

```bash
PORT=$(node -p "require('./.cocos-skill-config.json').port")
curl "http://127.0.0.1:${PORT}/skill/health"
```

如果 `3000` 端口被占用，服务会自动尝试后续端口（最多 10 次），并将最终端口同步持久化到 `Editor.Profile` 与 `.cocos-skill-config.json`。

## 工具集（19 个）

### 网关（4）
- `get_editor_context`
- `search_nodes`
- `editor_request`
- `apply_gated_action`

### 发现与查询（5）
- `query_nodes`
- `query_components`
- `get_available_asset_types`
- `get_available_component_types`
- `get_assets_by_type`

### 创建与修改（3）
- `create_nodes`
- `modify_nodes`
- `modify_components`

### 资源与项目（5）
- `operate_assets`
- `operate_current_scene`
- `operate_prefab_assets`
- `node_linked_prefabs_operations`
- `operate_project_settings`

### 高级能力（2）
- `operate_scripts_and_text`
- `execute_scene_code`

## HTTP API

Base URL：`http://127.0.0.1:<port>/skill`

| Endpoint | Method | 说明 |
|---|---|---|
| `/health` | GET | 服务状态、当前端口与工具列表 |
| `/tools` | GET | 已注册工具元数据 |
| `/context` | GET/POST | 执行 `get_editor_context` |
| `/search-nodes` | POST | 执行 `search_nodes` |
| `/query-nodes` | POST | 执行 `query_nodes` |
| `/create-nodes` | POST | 执行 `create_nodes` |
| `/modify-nodes` | POST | 执行 `modify_nodes` |
| `/query-components` | POST | 执行 `query_components` |
| `/modify-components` | POST | 执行 `modify_components` |
| `/current-scene` | POST | 执行 `operate_current_scene` |
| `/assets` | POST | 执行 `operate_assets` |
| `/prefab-assets` | POST | 执行 `operate_prefab_assets` |
| `/node-prefab` | POST | 执行 `node_linked_prefabs_operations` |
| `/discovery/components` | GET | 执行 `get_available_component_types` |
| `/discovery/assets` | GET | 执行 `get_available_asset_types` |
| `/discovery/assets-by-type` | POST | 执行 `get_assets_by_type` |
| `/project-settings` | POST | 执行 `operate_project_settings` |
| `/scripts-text` | POST | 执行 `operate_scripts_and_text` |
| `/execute-scene` | POST | 执行 `execute_scene_code` |
| `/editor-request` | POST | 执行 `editor_request` |
| `/apply-gated-action` | POST | 执行 `apply_gated_action` |
| `/tool/:toolName` | POST | 通用工具执行入口 |

示例：

```bash
curl -X POST http://127.0.0.1:3000/skill/create-nodes \
  -H "Content-Type: application/json" \
  -d '{"nodes":[{"type":"Empty","name":"MyNode"}]}'
```

## 开发

### 命令

```bash
npm install
npm run build
npm run build:watch
npm run build:tsc
npm run qa:skill-template
```

### 架构

- `source/core/`：传输层无关的工具契约与注册中心
- `source/adapters/`：HTTP 与编辑器消息适配层
- `source/infra/`：运行时集成（如 `Editor.Profile` 存储封装）
- `source/skill/tools/`：领域工具模块（19 个工具）
- `source/http/http-tool-server.ts`：HTTP 服务与 `/skill/*` 路由
- `source/main.ts`：扩展生命周期与适配器编排

## 故障排查

### 服务未启动

- 检查 Cocos Creator Console 中的启动日志与报错。
- 确认配置端口区间未被其他进程占用。
- 查看 `.cocos-skill-config.json` 中最新 `port` / `baseUrl`。
- 查看 `Editor.Profile` 中 `cocos-skill.server-config` 持久化值。

### API 调用失败

- 先检查 `/skill/health` 服务状态。
- 确认请求体符合对应工具的输入 schema。
- 通过 `/skill/tools` 核对工具名称与描述。

## 更新记录

见 `CHANGELOG.md`。
