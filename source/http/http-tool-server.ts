/**
 * HTTP Tool Server - Express HTTP server for skill tooling
 *
 * Provides REST endpoints under /skill/* prefix for all Cocos Creator tools.
 * Reuses existing tool implementations through the ToolRegistry adapter.
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { ToolRegistry, ToolValidationError, getToolRegistry } from './tool-registry.js';
import { ConfigStorage } from '../skill/config-storage.js';
import { SkillServerConfig, DEFAULT_SERVER_CONFIG } from '../skill/config.js';

// Import tool registration functions
import { registerCreateNodesTool } from '../skill/tools/create-nodes.js';
import { registerModifyNodesTool } from '../skill/tools/modify-nodes.js';
import { registerQueryNodesTool } from '../skill/tools/query-nodes.js';
import { registerQueryComponentsTool } from '../skill/tools/query-components.js';
import { registerModifyComponentsTool } from '../skill/tools/modify-components.js';
import { registerGetComponentDefinitionsTool } from '../skill/tools/get-component-definitions.js';
import { registerGetNodeDefinitionsTool } from '../skill/tools/get-node-definitions.js';
import { registerNodeLinkedPrefabsOperationsTool } from '../skill/tools/node-linked-prefabs-operations.js';
import { registerGetAvailableComponentTypesTool } from '../skill/tools/get-available-component-types.js';
import { registerGetAvailableAssetTypesTool } from '../skill/tools/get-available-asset-types.js';
import { registerOperateAssetsTool } from '../skill/tools/operate-assets.js';
import { registerGetAssetsByTypeTool } from '../skill/tools/get-assets-by-type.js';
import { registerOperateCurrentSceneTool } from '../skill/tools/operate-current-scene.js';
import { registerOperateProjectSettingsTool } from '../skill/tools/operate-project-settings.js';
import { registerOperatePrefabAssetsTool } from '../skill/tools/operate-prefab-assets.js';
import { registerOperateScriptsAndTextTool } from '../skill/tools/operate-scripts-and-text.js';
import { registerExecuteSceneCodeTool } from '../skill/tools/execute-scene-code.js';
import { registerGetEditorContextTool } from '../skill/tools/get-editor-context.js';
import { registerEditorRequestTool } from '../skill/tools/editor-request.js';
import { registerApplyGatedActionTool } from '../skill/tools/apply-gated-action.js';
import { registerSearchNodesTool } from '../skill/tools/search-nodes.js';

/**
 * Route mapping from HTTP endpoints to tool names
 */
const ROUTE_TO_TOOL: Record<string, string> = {
    '/skill/context': 'get_editor_context',
    '/skill/search-nodes': 'search_nodes',
    '/skill/query-nodes': 'query_nodes',
    '/skill/create-nodes': 'create_nodes',
    '/skill/modify-nodes': 'modify_nodes',
    '/skill/query-components': 'query_components',
    '/skill/modify-components': 'modify_components',
    '/skill/definitions/components': 'get_component_definitions',
    '/skill/definitions/nodes': 'get_node_definitions',
    '/skill/current-scene': 'operate_current_scene',
    '/skill/assets': 'operate_assets',
    '/skill/prefab-assets': 'operate_prefab_assets',
    '/skill/node-prefab': 'node_linked_prefabs_operations',
    '/skill/discovery/components': 'get_available_component_types',
    '/skill/discovery/assets': 'get_available_asset_types',
    '/skill/discovery/assets-by-type': 'get_assets_by_type',
    '/skill/project-settings': 'operate_project_settings',
    '/skill/scripts-text': 'operate_scripts_and_text',
    '/skill/execute-scene': 'execute_scene_code',
    '/skill/editor-request': 'editor_request',
    '/skill/apply-gated-action': 'apply_gated_action'
};

const TOOL_ARGS_WRAPPER_KEYS = new Set([
    'arguments',
    'args',
    'input',
    'payload',
    'body',
    'parameters',
    'params',
]);

const TOOL_CALL_METADATA_KEYS = new Set([
    'id',
    'name',
    'tool',
    'toolName',
    'method',
    'jsonrpc',
    'type',
]);

const MAX_ARGS_UNWRAP_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryParseJsonPayload(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return value;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function getArgsWrapperKey(payload: Record<string, unknown>): string | null {
    const keys = Object.keys(payload);
    for (const key of keys) {
        if (!TOOL_ARGS_WRAPPER_KEYS.has(key)) {
            continue;
        }
        const remainingKeys = keys.filter((entry) => entry !== key);
        const metadataOnly = remainingKeys.every((entry) => TOOL_CALL_METADATA_KEYS.has(entry));
        if (remainingKeys.length === 0 || metadataOnly) {
            return key;
        }
    }
    return null;
}

export function normalizeToolRequestArgs(payload: unknown): unknown {
    let currentPayload = tryParseJsonPayload(payload);
    for (let depth = 0; depth < MAX_ARGS_UNWRAP_DEPTH; depth++) {
        if (!isRecord(currentPayload)) {
            return currentPayload;
        }
        const wrapperKey = getArgsWrapperKey(currentPayload);
        if (!wrapperKey) {
            return currentPayload;
        }
        currentPayload = tryParseJsonPayload(currentPayload[wrapperKey]);
    }
    return currentPayload;
}

export class HttpToolServer {
    private static instance: HttpToolServer | null = null;
    private httpServer: HttpServer | null = null;
    private expressApp: express.Application | null = null;
    private config: SkillServerConfig = { ...DEFAULT_SERVER_CONFIG };
    private isRunning: boolean = false;
    private configStorage: ConfigStorage;
    private toolRegistry: ToolRegistry;

    constructor() {
        this.configStorage = new ConfigStorage();
        this.config = this.configStorage.loadConfig();
        this.toolRegistry = getToolRegistry();
        HttpToolServer.instance = this;
    }

    public static getInstance(): HttpToolServer | null {
        return HttpToolServer.instance;
    }

    /**
     * Register all tools with the registry
     */
    private registerTools(): void {
        const registry = this.toolRegistry as any; // Reuse registry through registerTool-compatible API

        // Gateway tools
        if (this.config.tools.getEditorContext) {
            registerGetEditorContextTool(registry);
        }
        if (this.config.tools.editorRequest) {
            registerEditorRequestTool(registry);
        }
        if (this.config.tools.applyGatedAction) {
            registerApplyGatedActionTool(registry);
        }
        if (this.config.tools.searchNodes) {
            registerSearchNodesTool(registry);
        }

        // Core tools
        if (this.config.tools.createNodes) {
            registerCreateNodesTool(registry);
        }
        if (this.config.tools.modifyNodes) {
            registerModifyNodesTool(registry);
        }
        if (this.config.tools.queryNodes) {
            registerQueryNodesTool(registry);
        }
        if (this.config.tools.queryComponents) {
            registerQueryComponentsTool(registry);
        }
        if (this.config.tools.modifyComponents) {
            registerModifyComponentsTool(registry);
        }

        // Definitions (schema/type hints)
        registerGetComponentDefinitionsTool(registry);
        registerGetNodeDefinitionsTool(registry);

        // Scene and asset tools
        if (this.config.tools.operateCurrentScene) {
            registerOperateCurrentSceneTool(registry);
        }
        if (this.config.tools.operatePrefabAssets) {
            registerOperatePrefabAssetsTool(registry);
        }
        if (this.config.tools.operateAssets) {
            registerOperateAssetsTool(registry);
        }
        if (this.config.tools.nodeLinkedPrefabsOperations) {
            registerNodeLinkedPrefabsOperationsTool(registry);
        }

        // Discovery tools
        if (this.config.tools.getAvailableComponentTypes) {
            registerGetAvailableComponentTypesTool(registry);
        }
        if (this.config.tools.getAvailableAssetTypes) {
            registerGetAvailableAssetTypesTool(registry);
        }
        if (this.config.tools.getAssetsByType) {
            registerGetAssetsByTypeTool(registry);
        }

        // Project tools
        if (this.config.tools.operateProjectSettings) {
            registerOperateProjectSettingsTool(registry);
        }

        // File system tools
        if (this.config.tools.operateScriptsAndText) {
            registerOperateScriptsAndTextTool(registry);
        }

        // Code execution tools
        if (this.config.tools.executeSceneCode) {
            registerExecuteSceneCodeTool(registry);
        }

        console.log(`Registered ${this.toolRegistry.getToolNames().length} tools`);
    }

    private buildErrorResponse(error: unknown, toolName?: string): { statusCode: number; body: Record<string, unknown> } {
        const message = error instanceof Error ? error.message : String(error);
        const addToolName = (body: Record<string, unknown>): Record<string, unknown> => {
            return toolName ? { ...body, tool: toolName } : body;
        };

        if (error instanceof ToolValidationError) {
            return {
                statusCode: 422,
                body: addToolName({
                    error: message,
                    type: 'validation_error',
                    details: error.issues.map((issue) => ({
                        path: issue.path.join('.'),
                        code: issue.code,
                        message: issue.message,
                    })),
                }),
            };
        }

        if (message.startsWith('Validation error:')) {
            return {
                statusCode: 422,
                body: addToolName({
                    error: message,
                    type: 'validation_error',
                }),
            };
        }

        return {
            statusCode: 500,
            body: addToolName({ error: message }),
        };
    }

    private respondWithToolError(res: Response, error: unknown, toolName?: string): void {
        const { statusCode, body } = this.buildErrorResponse(error, toolName);
        res.status(statusCode).json(body);
    }

    /**
     * Set up Express routes
     */
    private setupRoutes(): void {
        if (!this.expressApp) return;

        // CORS middleware
        this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        this.expressApp.use(express.json({ limit: '10mb' }));

        // Health check
        this.expressApp.get('/skill/health', (_req: Request, res: Response) => {
            res.json({
                status: 'ok',
                port: this.config.port,
                tools: this.toolRegistry.getToolNames(),
                version: this.config.version
            });
        });

        // List available tools
        this.expressApp.get('/skill/tools', (_req: Request, res: Response) => {
            const tools = this.toolRegistry.getAllTools().map(t => ({
                name: t.name,
                title: t.title,
                description: t.description
            }));
            res.json({ tools });
        });

        // Set up route-to-tool mappings
        for (const [route, toolName] of Object.entries(ROUTE_TO_TOOL)) {
            // GET for discovery endpoints, POST for others
            const isGetRoute = route.includes('/discovery/') && !route.includes('by-type');
            const method = isGetRoute ? 'get' : 'post';

            (this.expressApp as any)[method](route, async (req: Request, res: Response) => {
                try {
                    const rawArgs = method === 'get' ? req.query : req.body;
                    const args = method === 'get' ? rawArgs : normalizeToolRequestArgs(rawArgs);
                    const result = await this.toolRegistry.execute(toolName, args || {});
                    res.json(result);
                } catch (error) {
                    console.error(`Error executing ${toolName}:`, error);
                    this.respondWithToolError(res, error, toolName);
                }
            });
        }

        // Also allow GET for context endpoint
        this.expressApp.get('/skill/context', async (req: Request, res: Response) => {
            try {
                const result = await this.toolRegistry.execute('get_editor_context', req.query || {});
                res.json(result);
            } catch (error) {
                console.error('Error executing get_editor_context:', error);
                this.respondWithToolError(res, error, 'get_editor_context');
            }
        });

        // Generic tool endpoint
        this.expressApp.post('/skill/tool/:toolName', async (req: Request, res: Response) => {
            const { toolName } = req.params;
            try {
                if (!this.toolRegistry.hasTool(toolName)) {
                    res.status(404).json({ error: `Tool not found: ${toolName}` });
                    return;
                }
                const args = normalizeToolRequestArgs(req.body);
                const result = await this.toolRegistry.execute(toolName, args || {});
                res.json(result);
            } catch (error) {
                console.error(`Error executing ${toolName}:`, error);
                this.respondWithToolError(res, error, toolName);
            }
        });
    }

    public updateConfig(config: Partial<SkillServerConfig>): void {
        this.config = {
            ...this.config,
            ...config,
            tools: { ...this.config.tools, ...config.tools }
        };
        this.configStorage.saveConfig(this.config);
    }

    public getConfig(): SkillServerConfig {
        return { ...this.config };
    }

    public getServerInfo(): { isRunning: boolean; config: SkillServerConfig } {
        return {
            isRunning: this.isRunning,
            config: this.getConfig()
        };
    }

    public isServerRunning(): boolean {
        return this.isRunning;
    }

    public async startServer(): Promise<void> {
        if (this.isRunning) {
            console.log('HTTP server is already running, skipping start');
            return;
        }

        try {
            // Register tools
            this.registerTools();

            // Create Express app
            this.expressApp = express();
            this.setupRoutes();

            // Create HTTP server
            this.httpServer = createServer(this.expressApp);

            // Try to start server with auto port increment
            const maxRetries = 10;
            let currentPort = this.config.port;
            let started = false;

            for (let attempt = 0; attempt < maxRetries && !started; attempt++) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        this.httpServer!.once('error', (error: Error & { code?: string }) => {
                            if (error.code === 'EADDRINUSE') {
                                console.warn(`Port ${currentPort} is in use, trying ${currentPort + 1}...`);
                                currentPort++;
                                resolve();
                            } else {
                                reject(error);
                            }
                        });

                        this.httpServer!.listen(currentPort, () => {
                            started = true;
                            resolve();
                        });
                    });

                    if (!started) {
                        this.httpServer.close();
                        this.httpServer = createServer(this.expressApp);
                    }
                } catch (error) {
                    throw error;
                }
            }

            if (!started) {
                throw new Error(`Failed to find available port after ${maxRetries} attempts`);
            }

            // Update config with actual port if changed
            if (currentPort !== this.config.port) {
                console.log(`Port changed from ${this.config.port} to ${currentPort}`);
                this.config.port = currentPort;
                this.configStorage.saveConfig(this.config);
            }

            this.isRunning = true;
            console.log(`HTTP tool server started on port ${this.config.port}`);
            console.log(`Available endpoints: /skill/health, /skill/tools, /skill/context, ...`);
        } catch (error) {
            this.isRunning = false;
            this.httpServer = null;
            this.expressApp = null;
            throw error;
        }
    }

    public async stopServer(): Promise<void> {
        if (!this.isRunning) {
            console.log('HTTP server is not running, skipping stop');
            return;
        }

        try {
            if (this.httpServer) {
                await new Promise<void>((resolve) => {
                    this.httpServer!.close(() => resolve());
                });
                this.httpServer = null;
            }

            this.expressApp = null;
            this.isRunning = false;
            console.log('HTTP tool server stopped');
        } catch (error) {
            console.error('Error stopping HTTP server:', error);
            throw error;
        }
    }

    // UUID encoding utilities (for compatibility with existing tools)
    public static encodeUuid(uuid: string): string {
        return uuid.includes('@') ? btoa(uuid) : uuid;
    }

    public static decodeUuid(encodedUuid: string): string {
        if (HttpToolServer.isBase64(encodedUuid)) {
            const decodedUuid = atob(encodedUuid);
            if (decodedUuid.includes('@')) {
                return decodedUuid;
            }
        }
        return encodedUuid;
    }

    private static isBase64(str: string): boolean {
        if (!str || str.length % 4 !== 0) return false;
        const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        return base64Regex.test(str);
    }
}
