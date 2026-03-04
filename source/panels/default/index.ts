/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent } from 'vue';

const panelDataMap = new WeakMap<any, App>();
/**
 * @zh 如果希望兼容 3.3 之前的版本可以使用下方的代码
 * @en You can add the code below if you want compatibility with versions prior to 3.3
 */
// Editor.Panel.define = Editor.Panel.define || function(options: any) { return options }
module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('show'); },
        hide() { console.log('hide'); },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
    },
    methods: {
    },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
           
            app.component('SkillServerControl', defineComponent({
                data() {
                    const VERSION = '1.0.0';
                    // Default tools configuration - all enabled
                    const defaultTools = {
                        getEditorContext: true,
                        searchNodes: true,
                        editorRequest: true,
                        applyGatedAction: true,
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
                    };

                    return {
                        VERSION,
                        serverInfo: {
                            isRunning: false,
                            config: {
                                port: 3000,
                                name: 'cocos-skill-server',
                                version: VERSION,
                                autoStart: true,
                                tools: { ...defaultTools }
                            }
                        },
                        config: {
                            port: 3000,
                            name: 'cocos-skill-server',
                            autoStart: true,
                            tools: { ...defaultTools }
                        },
                        isLoading: false
                    };
                }, 
                methods: {
                    // Toggle server on/off
                    async toggleServer() {
                        if (this.serverInfo.isRunning) {
                            await this.stopServer();
                        } else {
                            await this.startServer();
                        }
                    },

                    async startServer() {
                        this.isLoading = true;

                        try {
                            const configData = JSON.parse(JSON.stringify({
                                port: Number(this.config.port) || 3000,
                                name: String(this.config.name) || 'cocos-skill-server',
                                version: this.VERSION,
                                autoStart: true,
                                tools: this.config.tools
                            }));
                            const result = await Editor.Message.request('cocos-skill', 'start-skill-server', configData);
                            if (result && result.success) {
                                await this.refreshServerInfo();
                            } else {
                                console.error(`Failed to start server: ${result ? result.message : 'Unknown error'}`);
                            }
                        } catch (error) {
                            console.error(`Error starting server: ${error}`);
                        } finally {
                            this.isLoading = false;
                        }
                    },
                    
                    async stopServer() {
                        this.isLoading = true;
                        
                        try {
                            const result = await Editor.Message.request('cocos-skill', 'stop-skill-server');  
                            if (result && result.success) {
                                await this.refreshServerInfo();
                            } else {
                                console.error(`Failed to stop server: ${result ? result.message : 'Unknown error'}`);
                            }
                        } catch (error) {
                            console.error(`Error stopping server: ${error}`);
                        } finally {
                            this.isLoading = false;
                        }
                    },
                    
                    async refreshServerInfo() {
                        try {
                            const info = await Editor.Message.request('cocos-skill', 'get-skill-server-info');
                            this.serverInfo = JSON.parse(JSON.stringify({
                                isRunning: info.isRunning,
                                config: {
                                    port: info.config.port,
                                    name: info.config.name,
                                    version: this.VERSION,
                                    autoStart: true,
                                    tools: info.config.tools
                                }
                            }));

                            if (info.isRunning && info.config.tools) {
                                this.config = JSON.parse(JSON.stringify({
                                    port: info.config.port,
                                    name: info.config.name,
                                    autoStart: true,
                                    tools: info.config.tools
                                }));
                            } else if (!info.isRunning) {
                                this.config.port = info.config.port;
                                this.config.name = info.config.name;
                            }
                        } catch (error) {
                            console.error('Error getting server info:', error);
                        }
                    }
                },
                
                async mounted() {
                    // Load initial config from server
                    await this.refreshServerInfo();

                    // Initialize local config with server config or defaults
                    this.config = {
                        port: this.serverInfo.config.port,
                        name: this.serverInfo.config.name,
                        autoStart: true,
                        tools: { ...this.serverInfo.config.tools }
                    };
                    
                    // Periodically refresh server status
                    setInterval(async () => {
                        try {
                            const info = await Editor.Message.request('cocos-skill', 'get-skill-server-info');
                            this.serverInfo.isRunning = info.isRunning;
                            this.serverInfo.config.port = info.config.port;
                            this.serverInfo.config.name = info.config.name;
                            
                            if (info.isRunning) {
                                this.serverInfo.config.tools = info.config.tools;
                            }
                        } catch (error) {
                            console.error('Error refreshing server status:', error);
                        }
                    }, 5000);
                },
                
                template: readFileSync(join(__dirname, '../../../static/template/vue/skill-server-control.html'), 'utf-8'),
            }));
            app.mount(this.$.app);
            panelDataMap.set(this, app);
        }
    },
    beforeClose() { },
    close() {
        const app = panelDataMap.get(this);
        if (app) {
            app.unmount();
        }
    },
});
