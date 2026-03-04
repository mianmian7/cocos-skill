/**
 * Editor Request Schema Definitions
 *
 * 基于 @cocos/creator-types 官方类型定义提取的完整参数说明。
 * 用于 editor_request 工具的命令白名单和参数校验。
 *
 * 参考文件：
 * - @cocos/creator-types/editor/packages/scene/@types/message.d.ts
 * - @cocos/creator-types/editor/packages/scene/@types/public.d.ts
 * - @cocos/creator-types/editor/packages/asset-db/@types/message.d.ts
 * - @cocos/creator-types/editor/packages/asset-db/@types/public.d.ts
 * - @cocos/creator-types/editor/packages/project/@types/message.d.ts
 */

/**
 * 命令 Schema 定义
 */
export interface CommandSchema {
  /** 消息通道 */
  channel: string;
  /** 命令名称 */
  command: string;
  /** 操作模式：read = 只读（安全），write = 写入（需谨慎） */
  mode: 'read' | 'write';
  /** 命令描述 */
  description: string;
  /** 参数说明（TypeScript 风格） */
  argsSchema?: string;
  /** 官方类型名称（对应 @cocos/creator-types 中的接口） */
  officialType?: string;
  /** 返回值类型 */
  returnType?: string;
}

// ==================== Scene Commands ====================

export const SCENE_COMMANDS: CommandSchema[] = [
  // -------- Scene 读取操作 --------
  {
    channel: 'scene',
    command: 'query-node',
    mode: 'read',
    description: '查询单个节点的完整 dump 数据',
    argsSchema: '[uuid: string]',
    officialType: 'string',
    returnType: 'INode',
  },
  {
    channel: 'scene',
    command: 'query-node-tree',
    mode: 'read',
    description: '查询节点树结构（可指定根节点 UUID）',
    argsSchema: '[] | [rootUuid?: string]',
    officialType: 'string?',
    returnType: 'INode',
  },
  {
    channel: 'scene',
    command: 'query-component',
    mode: 'read',
    description: '查询单个组件的完整 dump 数据',
    argsSchema: '[componentUuid: string]',
    officialType: 'string',
    returnType: 'IComponent',
  },
  {
    channel: 'scene',
    command: 'query-components',
    mode: 'read',
    description: '列出所有已注册的组件类型信息',
    argsSchema: '[]',
    returnType: '{ name: string, cid: string, path: string, assetUuid: string }[]',
  },
  {
    channel: 'scene',
    command: 'query-classes',
    mode: 'read',
    description: '查询可用的组件类（可按基类过滤）',
    argsSchema: '[{ extends?: string | string[], excludeSelf?: boolean }]',
    officialType: 'QueryClassesOptions',
    returnType: '{ name: string }[]',
  },
  {
    channel: 'scene',
    command: 'query-dirty',
    mode: 'read',
    description: '检查当前场景是否有未保存的更改',
    argsSchema: '[]',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'query-is-ready',
    mode: 'read',
    description: '检查场景编辑器是否已就绪',
    argsSchema: '[]',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'query-nodes-by-asset-uuid',
    mode: 'read',
    description: '查找使用指定资源的所有节点 UUID',
    argsSchema: '[assetUuid: string]',
    officialType: 'string',
    returnType: 'string[]',
  },
  {
    channel: 'scene',
    command: 'query-is2D',
    mode: 'read',
    description: '查询当前是否为 2D 编辑模式',
    argsSchema: '[]',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'query-gizmo-tool-name',
    mode: 'read',
    description: '查询当前 Gizmo 工具名称',
    argsSchema: '[]',
    returnType: 'string',
  },
  {
    channel: 'scene',
    command: 'query-gizmo-pivot',
    mode: 'read',
    description: '查询当前 Gizmo 轴心模式',
    argsSchema: '[]',
    returnType: 'string',
  },
  {
    channel: 'scene',
    command: 'query-gizmo-coordinate',
    mode: 'read',
    description: '查询当前 Gizmo 坐标系模式',
    argsSchema: '[]',
    returnType: 'string',
  },
  {
    channel: 'scene',
    command: 'query-component-has-script',
    mode: 'read',
    description: '查询组件是否有关联的脚本文件',
    argsSchema: '[componentCid: string]',
    officialType: 'string',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'query-scene-bounds',
    mode: 'read',
    description: '查询场景边界尺寸',
    argsSchema: '[]',
    returnType: '{ x: number, y: number, width: number, height: number }',
  },
  {
    channel: 'scene',
    command: 'query-is-grid-visible',
    mode: 'read',
    description: '查询网格是否可见',
    argsSchema: '[]',
    returnType: 'boolean',
  },

  // -------- Scene 写入操作 --------
  {
    channel: 'scene',
    command: 'create-node',
    mode: 'write',
    description: '创建节点',
    argsSchema: `[{
  parent?: string,              // 父节点 UUID
  name?: string,                // 节点名称
  keepWorldTransform?: boolean, // 保持世界坐标不变
  assetUuid?: string,           // 从资源创建节点
  nameIncrease?: boolean,       // 名称自增（如 xxx001 → xxx002）
  snapshot?: boolean,           // 是否创建 undo 快照
  type?: string,                // 资源类型
  unlinkPrefab?: boolean,       // 创建后取消 prefab 状态
  position?: { x, y, z },       // 初始位置
  canvasRequired?: boolean,     // 是否需要 Canvas
  autoAdaptToCreate?: boolean   // 根据 2D/3D 模式自适应创建
}]`,
    officialType: 'CreateNodeOptions',
    returnType: 'string (uuid)',
  },
  {
    channel: 'scene',
    command: 'remove-node',
    mode: 'write',
    description: '删除节点（支持批量）',
    argsSchema: '[{ uuid: string | string[], keepWorldTransform?: boolean }]',
    officialType: 'RemoveNodeOptions',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'set-property',
    mode: 'write',
    description: '设置节点/组件属性值',
    argsSchema: `[{
  uuid: string,     // 节点或组件的 UUID
  path: string,     // 属性路径（如 "position", "__comps__.0.color"）
  dump: {           // 属性 dump 数据
    type: string,   // 值类型（如 "cc.Vec3", "cc.Color"）
    value: any      // 具体值
  }
}]`,
    officialType: 'SetPropertyOptions',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'reset-property',
    mode: 'write',
    description: '重置属性为默认值',
    argsSchema: `[{
  uuid: string,   // 节点或组件的 UUID
  path: string,   // 属性路径
  dump: IProperty // 属性 dump 数据
}]`,
    officialType: 'SetPropertyOptions',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'create-component',
    mode: 'write',
    description: '为节点添加组件',
    argsSchema: '[{ uuid: string, component: string }]',
    officialType: 'CreateComponentOptions',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'remove-component',
    mode: 'write',
    description: '移除组件（仅需组件 UUID）',
    argsSchema: '[{ uuid: string }]',
    officialType: 'RemoveComponentOptions',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'reset-component',
    mode: 'write',
    description: '重置组件属性为默认值',
    argsSchema: '[{ uuid: string }]',
    officialType: 'ResetComponentOptions',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'move-array-element',
    mode: 'write',
    description: '移动数组元素位置（调整顺序）',
    argsSchema: '[{ uuid: string, path: string, target: number, offset: number }]',
    officialType: 'MoveArrayOptions',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'remove-array-element',
    mode: 'write',
    description: '移除数组元素',
    argsSchema: '[{ uuid: string, path: string, index: number }]',
    officialType: 'RemoveArrayOptions',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'duplicate-node',
    mode: 'write',
    description: '复制节点（就地复制）',
    argsSchema: '[uuid: string | string[]]',
    returnType: 'string[] (新节点 UUID 列表)',
  },
  {
    channel: 'scene',
    command: 'copy-node',
    mode: 'write',
    description: '复制节点到剪贴板',
    argsSchema: '[uuid: string | string[]]',
    returnType: 'string[] (被复制的 UUID 列表)',
  },
  {
    channel: 'scene',
    command: 'paste-node',
    mode: 'write',
    description: '粘贴节点',
    argsSchema: `[{
  target: string,               // 目标父节点 UUID
  uuids: string | string[],     // 被粘贴的节点 UUID
  keepWorldTransform?: boolean, // 保持世界坐标
  pasteAsChild?: boolean        // 粘贴为子节点
}]`,
    officialType: 'PasteNodeOptions',
    returnType: 'string[] (新节点 UUID 列表)',
  },
  {
    channel: 'scene',
    command: 'cut-node',
    mode: 'write',
    description: '剪切节点到剪贴板',
    argsSchema: '[uuid: string | string[]]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'set-parent',
    mode: 'write',
    description: '设置节点父级',
    argsSchema: `[{
  parent: string,               // 目标父节点 UUID
  uuids: string | string[],     // 要移动的节点 UUID
  keepWorldTransform?: boolean  // 保持世界坐标
}]`,
    officialType: 'CutNodeOptions',
    returnType: 'string[]',
  },
  {
    channel: 'scene',
    command: 'reset-node',
    mode: 'write',
    description: '重置节点属性为默认值',
    argsSchema: '[{ uuid: string | string[] }]',
    officialType: 'ResetNodeOptions',
    returnType: 'boolean',
  },
  {
    channel: 'scene',
    command: 'restore-prefab',
    mode: 'write',
    description: '恢复节点的 prefab 状态',
    argsSchema: '[{ uuid: string }]',
    officialType: 'ResetComponentOptions',
    returnType: 'boolean',
  },

  // -------- Scene 场景操作 --------
  {
    channel: 'scene',
    command: 'open-scene',
    mode: 'write',
    description: '打开场景',
    argsSchema: '[sceneAssetUuid: string]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'save-scene',
    mode: 'write',
    description: '保存当前场景',
    argsSchema: '[] | [saveAs?: boolean]',
    returnType: 'string | undefined (场景资源路径)',
  },
  {
    channel: 'scene',
    command: 'save-as-scene',
    mode: 'write',
    description: '另存为场景',
    argsSchema: '[]',
    returnType: 'string | undefined (新场景资源路径)',
  },
  {
    channel: 'scene',
    command: 'close-scene',
    mode: 'write',
    description: '关闭当前场景',
    argsSchema: '[]',
    returnType: 'boolean',
  },

  // -------- Scene Undo/快照 操作 --------
  {
    channel: 'scene',
    command: 'snapshot',
    mode: 'write',
    description: '创建 Undo 快照',
    argsSchema: '[]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'snapshot-abort',
    mode: 'write',
    description: '取消 Undo 快照',
    argsSchema: '[]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'soft-reload',
    mode: 'write',
    description: '软重载场景（不重新加载资源）',
    argsSchema: '[]',
    returnType: 'void',
  },

  // -------- Scene Gizmo 操作 --------
  {
    channel: 'scene',
    command: 'change-gizmo-tool',
    mode: 'write',
    description: '切换 Gizmo 工具（move/rotate/scale/rect）',
    argsSchema: '[toolName: string]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'change-gizmo-pivot',
    mode: 'write',
    description: '切换 Gizmo 轴心模式（pivot/center）',
    argsSchema: '[pivot: string]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'change-gizmo-coordinate',
    mode: 'write',
    description: '切换 Gizmo 坐标系（local/global）',
    argsSchema: '[coordinate: string]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'change-is2D',
    mode: 'write',
    description: '切换 2D/3D 编辑模式',
    argsSchema: '[is2D: boolean]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'set-grid-visible',
    mode: 'write',
    description: '设置网格可见性',
    argsSchema: '[visible: boolean]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'focus-camera',
    mode: 'write',
    description: '聚焦摄像机到指定节点',
    argsSchema: '[uuids: string[]]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'align-with-view',
    mode: 'write',
    description: '将选中节点对齐到当前视图',
    argsSchema: '[]',
    returnType: 'void',
  },
  {
    channel: 'scene',
    command: 'align-view-with-node',
    mode: 'write',
    description: '将视图对齐到选中节点',
    argsSchema: '[]',
    returnType: 'void',
  },

  // -------- Scene 脚本执行 --------
  {
    channel: 'scene',
    command: 'execute-scene-script',
    mode: 'write',
    description: '执行场景脚本方法',
    argsSchema: '[{ name: string, method: string, args: any[] }]',
    officialType: 'ExecuteSceneScriptMethodOptions',
    returnType: 'any',
  },
  {
    channel: 'scene',
    command: 'execute-component-method',
    mode: 'write',
    description: '执行组件方法',
    argsSchema: '[{ uuid: string, name: string, args: any[] }]',
    officialType: 'ExecuteComponentMethodOptions',
    returnType: 'any',
  },
];

// ==================== Asset-DB Commands ====================

export const ASSET_DB_COMMANDS: CommandSchema[] = [
  // -------- Asset-DB 读取操作 --------
  {
    channel: 'asset-db',
    command: 'query-asset-info',
    mode: 'read',
    description: '查询资源信息',
    argsSchema: '[urlOrUuidOrPath: string, dataKeys?: string[]]',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'query-asset-meta',
    mode: 'read',
    description: '查询资源元数据',
    argsSchema: '[urlOrUuid: string]',
    returnType: 'IAssetMeta | null',
  },
  {
    channel: 'asset-db',
    command: 'query-assets',
    mode: 'read',
    description: '批量查询资源',
    argsSchema: `[options?: {
  ccType?: string | string[],    // 资源类型，如 'cc.ImageAsset'
  isBundle?: boolean,            // 筛选 asset bundle
  importer?: string | string[],  // 导入器名称
  pattern?: string,              // 路径匹配 (globs)
  extname?: string | string[],   // 扩展名
  userData?: Record<string, any> // 自定义 userData 过滤
}, dataKeys?: (keyof AssetInfo)[]]`,
    officialType: 'QueryAssetsOption',
    returnType: 'AssetInfo[]',
  },
  {
    channel: 'asset-db',
    command: 'query-path',
    mode: 'read',
    description: '查询资源的文件系统绝对路径',
    argsSchema: '[uuid: string]',
    returnType: 'string | null',
  },
  {
    channel: 'asset-db',
    command: 'query-url',
    mode: 'read',
    description: '查询资源 URL（如 db://assets/...）',
    argsSchema: '[uuid: string]',
    returnType: 'string | null',
  },
  {
    channel: 'asset-db',
    command: 'query-uuid',
    mode: 'read',
    description: '从 URL 或路径获取资源 UUID',
    argsSchema: '[urlOrPath: string]',
    returnType: 'string | null',
  },
  {
    channel: 'asset-db',
    command: 'query-asset-users',
    mode: 'read',
    description: '查询哪些资源/脚本使用了指定资源',
    argsSchema: '[uuidOrUrl: string, type?: "asset" | "script" | "all"]',
    returnType: 'string[] (UUID 列表)',
  },
  {
    channel: 'asset-db',
    command: 'query-asset-dependencies',
    mode: 'read',
    description: '查询资源依赖的其他资源/脚本',
    argsSchema: '[uuidOrUrl: string, type?: "asset" | "script" | "all"]',
    returnType: 'string[] (UUID 列表)',
  },
  {
    channel: 'asset-db',
    command: 'query-ready',
    mode: 'read',
    description: '检查资源数据库是否就绪',
    argsSchema: '[]',
    returnType: 'boolean',
  },
  {
    channel: 'asset-db',
    command: 'generate-available-url',
    mode: 'read',
    description: '生成可用的资源 URL（避免命名冲突）',
    argsSchema: '[url: string]',
    returnType: 'string',
  },

  // -------- Asset-DB 写入操作 --------
  {
    channel: 'asset-db',
    command: 'create-asset',
    mode: 'write',
    description: '创建资源',
    argsSchema: '[url: string, content: string | Buffer | null, options?: { overwrite?: boolean, rename?: boolean }]',
    officialType: 'AssetOperationOption',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'save-asset',
    mode: 'write',
    description: '保存资源内容',
    argsSchema: '[urlOrUuid: string, content: string | Buffer]',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'save-asset-meta',
    mode: 'write',
    description: '保存资源元数据',
    argsSchema: '[urlOrUuid: string, metaJsonString: string]',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'copy-asset',
    mode: 'write',
    description: '复制资源',
    argsSchema: '[sourceUrl: string, targetUrl: string, options?: { overwrite?: boolean, rename?: boolean }]',
    officialType: 'AssetOperationOption',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'move-asset',
    mode: 'write',
    description: '移动/重命名资源',
    argsSchema: '[sourceUrl: string, targetUrl: string, options?: { overwrite?: boolean, rename?: boolean }]',
    officialType: 'AssetOperationOption',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'delete-asset',
    mode: 'write',
    description: '删除资源',
    argsSchema: '[urlOrUuid: string]',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'refresh-asset',
    mode: 'write',
    description: '刷新资源（重新导入）',
    argsSchema: '[urlOrUuid: string]',
    returnType: 'void',
  },
  {
    channel: 'asset-db',
    command: 'reimport-asset',
    mode: 'write',
    description: '重新导入资源',
    argsSchema: '[urlOrUuid: string]',
    returnType: 'void',
  },
  {
    channel: 'asset-db',
    command: 'import-asset',
    mode: 'write',
    description: '从外部文件导入资源',
    argsSchema: '[sourcePath: string, targetUrl: string, options?: { overwrite?: boolean, rename?: boolean }]',
    officialType: 'AssetOperationOption',
    returnType: 'AssetInfo | null',
  },
  {
    channel: 'asset-db',
    command: 'open-asset',
    mode: 'write',
    description: '在默认编辑器中打开资源',
    argsSchema: '[urlOrUuid: string]',
    returnType: 'void',
  },
];

// ==================== Selection Commands ====================

export const SELECTION_COMMANDS: CommandSchema[] = [
  {
    channel: 'selection',
    command: 'select',
    mode: 'write',
    description: '选择节点或资源',
    argsSchema: '[type: "node" | "asset", uuids: string[]]',
    returnType: 'void',
  },
  {
    channel: 'selection',
    command: 'unselect',
    mode: 'write',
    description: '取消选择',
    argsSchema: '[type: "node" | "asset", uuids: string[]]',
    returnType: 'void',
  },
  {
    channel: 'selection',
    command: 'clear',
    mode: 'write',
    description: '清除所有选择',
    argsSchema: '[type: "node" | "asset"]',
    returnType: 'void',
  },
];

// ==================== Project Commands ====================

export const PROJECT_COMMANDS: CommandSchema[] = [
  {
    channel: 'project',
    command: 'query-config',
    mode: 'read',
    description: '查询项目配置',
    argsSchema: '[protocol: string, key?: string]',
    returnType: 'any',
  },
  {
    channel: 'project',
    command: 'set-config',
    mode: 'write',
    description: '设置项目配置',
    argsSchema: '[protocol: string, key: string, value: any]',
    returnType: 'boolean',
  },
  {
    channel: 'project',
    command: 'open-settings',
    mode: 'write',
    description: '打开项目设置面板',
    argsSchema: '[tab: string, section: string, ...args: any[]]',
    returnType: 'void',
  },
];

// ==================== All Commands ====================

export const ALL_COMMANDS: CommandSchema[] = [
  ...SCENE_COMMANDS,
  ...ASSET_DB_COMMANDS,
  ...SELECTION_COMMANDS,
  ...PROJECT_COMMANDS,
];

// ==================== 快速查找表 ====================

const commandMap = new Map<string, CommandSchema>();
for (const cmd of ALL_COMMANDS) {
  commandMap.set(`${cmd.channel}:${cmd.command}`, cmd);
}

/**
 * 检查命令是否在白名单中
 */
export function getCommandSchema(channel: string, command: string): CommandSchema | undefined {
  return commandMap.get(`${channel}:${command}`);
}

/**
 * 获取指定通道的所有命令
 */
export function getCommandsByChannel(channel: string): CommandSchema[] {
  return ALL_COMMANDS.filter(cmd => cmd.channel === channel);
}

/**
 * 获取所有可用通道
 */
export function getAvailableChannels(): string[] {
  return [...new Set(ALL_COMMANDS.map(cmd => cmd.channel))];
}
