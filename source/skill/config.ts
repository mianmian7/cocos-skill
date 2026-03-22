export interface SkillServerToolConfig {
  // Gateway tools (recommended for AI programming workflows)
  getEditorContext: boolean;
  editorRequest: boolean;
  applyGatedAction: boolean;
  searchNodes: boolean;

  // Core tools (always enabled)
  createNodes: boolean;
  modifyNodes: boolean;
  queryNodes: boolean;
  queryComponents: boolean;
  modifyComponents: boolean;

  // Scene and asset tools
  operateCurrentScene: boolean;
  operatePrefabAssets: boolean;
  operateAssets: boolean;
  operateAnimation: boolean;
  nodeLinkedPrefabsOperations: boolean;

  // Discovery tools
  getAvailableComponentTypes: boolean;
  getAvailableAssetTypes: boolean;
  getAssetsByType: boolean;

  // Project tools
  operateProjectSettings: boolean;

  // File system tools (optional)
  operateScriptsAndText: boolean;

  // Code execution tools (optional, security-sensitive)
  executeSceneCode: boolean;
}

export interface SkillServerConfig {
  port: number;
  name: string;
  version: string;
  autoStart: boolean;  // 扩展加载时自动启动HTTP工具服务器
  tools: SkillServerToolConfig;
}

export const DEFAULT_TOOL_CONFIG: SkillServerToolConfig = {
  // Gateway tools (enabled by default for optimal AI experience)
  getEditorContext: true,
  editorRequest: true,
  applyGatedAction: true,
  searchNodes: true,

  // Core tools (always enabled)
  createNodes: true,
  modifyNodes: true,
  queryNodes: true,
  queryComponents: true,
  modifyComponents: true,

  // Scene and asset tools (enabled by default)
  operateCurrentScene: true,
  operatePrefabAssets: true,
  operateAssets: true,
  operateAnimation: true,
  nodeLinkedPrefabsOperations: true,

  // Discovery tools (enabled by default)
  getAvailableComponentTypes: true,
  getAvailableAssetTypes: true,
  getAssetsByType: true,

  // Project tools (enabled by default)
  operateProjectSettings: true,

  // File system tools (enabled by default)
  operateScriptsAndText: true,

  // Code execution tools (enabled by default for AI programming workflows)
  executeSceneCode: true,
};

export const DEFAULT_SERVER_CONFIG: SkillServerConfig = {
  port: 3000,
  name: "cocos-skill-server",
  version: "1.0.0",
  autoStart: true,  // 默认自动启动，提升开发体验
  tools: DEFAULT_TOOL_CONFIG,
};
