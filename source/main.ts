import { HttpServerAdapter } from './adapters/http/http-server.js';
import { SKILL_MESSAGES } from './adapters/editor/messages.js';
import { ProfileStorage } from './infra/config/profile-storage.js';
import { ConfigStorage } from './skill/config-storage.js';

const profileStorage = new ProfileStorage();
const PROFILE_KEY = 'cocos-skill.server-config';

function getHttpServerAdapter(): HttpServerAdapter {
  return HttpServerAdapter.getInstance();
}

function getFallbackServerInfo() {
  const fallbackConfig = {
    port: 3000,
    name: 'cocos-skill-server',
    version: '1.0.0',
    autoStart: true,
    tools: {
      createNodes: true,
      modifyNodes: true,
      queryNodes: true,
      queryComponents: true,
      modifyComponents: true,
      operateCurrentScene: true,
      operatePrefabAssets: true,
      operateAssets: true,
      nodeLinkedPrefabsOperations: true,
      getAvailableComponentTypes: true,
      getAvailableAssetTypes: true,
      getAssetsByType: true,
      operateProjectSettings: true,
      operateScriptsAndText: true,
      executeSceneCode: true
    }
  };

  return {
    isRunning: false,
    config: profileStorage.load(PROFILE_KEY, fallbackConfig)
  };
}

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export const load: () => void = function () {
  console.log('Cocos HTTP Extension loaded');

  try {
    const configStorage = new ConfigStorage();
    configStorage.ensureProjectSetup();
    console.log('HTTP server configuration is ready');
  } catch (error) {
    console.warn('Failed to ensure config:', error);
  }

  (async () => {
    try {
      const adapter = getHttpServerAdapter();
      const info = adapter.getInfo();
      if (info.config.autoStart && !info.isRunning) {
        console.log('Auto-starting HTTP tool server...');
        await adapter.start();
        console.log('HTTP tool server auto-started successfully');
      }
    } catch (error) {
      console.error('Failed to auto-start HTTP tool server:', error);
    }
  })();
};

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export const unload: () => Promise<void> = async function () {
  try {
    const result = await methods.stopHttpServer();
    if (result?.success === false) {
      console.error('Failed to stop HTTP server during unload:', result.message);
    }
  } catch (error) {
    console.error('Error stopping HTTP server during unload:', error);
  }

  console.log('Cocos Skill Extension unloaded');
};

export const methods: Record<string, (...args: any[]) => any> = {
  async startHttpServer(config: any) {
    try {
      console.log('Starting HTTP tool server with config:', config);
      const adapter = getHttpServerAdapter();
      await adapter.start(config);
      return { success: true, message: 'HTTP tool server started successfully' };
    } catch (error) {
      console.error('Error starting HTTP tool server:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  },

  async stopHttpServer() {
    try {
      const adapter = getHttpServerAdapter();
      await adapter.stop();
      return { success: true, message: 'HTTP tool server stopped successfully' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  },

  async getHttpServerInfo() {
    try {
      const adapter = getHttpServerAdapter();
      return adapter.getInfo();
    } catch (error) {
      console.error('Error getting server info:', error);
      return getFallbackServerInfo();
    }
  },

  async updateHttpServerConfig(config: any) {
    try {
      const adapter = getHttpServerAdapter();
      adapter.updateConfig(config);
      profileStorage.save(PROFILE_KEY, config);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  },

  [SKILL_MESSAGES.startServer]: async function (config: any) {
    return methods.startHttpServer(config);
  },

  [SKILL_MESSAGES.stopServer]: async function () {
    return methods.stopHttpServer();
  },

  [SKILL_MESSAGES.getServerInfo]: async function () {
    return methods.getHttpServerInfo();
  },

  [SKILL_MESSAGES.updateServerConfig]: async function (config: any) {
    return methods.updateHttpServerConfig(config);
  }
};
