import { create } from 'domain';
import { get } from 'http';
import { join } from 'path';
module.paths.push(join(Editor.App.path, 'node_modules'));

const MAX_LOGS = 500;
const logs: Array<string> = new Array<string>();
const allLogs: Array<string> = new Array<string>();

function addToLogs(message: string) {
    // Add to temporary logs (cleared on each capture)
    logs.push(message);
    
    // Add to persistent logs with circular buffer
    allLogs.push(message);
    if (allLogs.length > MAX_LOGS) {
        allLogs.shift(); // Remove oldest log
    }
}

export function load() {
    console.log = ((log) => {
        return (...args: any[]) => {
            log.apply(console, args);
            addToLogs("LOG: " + args.join(','));
        };
    })(console.log);
    console.error = ((error) => {
        return (...args: any[]) => {
            error.apply(console, args);
            addToLogs("ERROR: " + args.join(','));
        };
    })(console.error);
    console.warn = ((warn) => {
        return (...args: any[]) => {
            warn.apply(console, args);
            addToLogs("WARN: " + args.join(','));
        };
    })(console.warn);
};
export function unload() {};
export const methods: Record<string, (...args: any[]) => any> = {
    queryComponentTypes() {
        const cc = (globalThis as any)['cc'];
        const js = cc.js;
        const Component = cc.Component;
        const result: string[] = [];
        Object.keys(js._registeredClassNames).forEach((key) => {
            if (js.isChildClassOf(js.getClassByName(key), Component) &&
                !key.includes('Component')) {
                result.push(key);
            }
        });
        return result;
    },

    queryAssetTypes() {
        const cc = (globalThis as any)['cc'];
        const js = cc.js;
        const Asset = cc.Asset;
        const result: string[] = [];
        Object.keys(js._registeredClassNames).forEach((key) => {
            if (js.isChildClassOf(js.getClassByName(key), Asset)) {
                result.push(key);
            }
        });
        return result;
    },

    isCorrectComponentType(type: string): boolean {
        const cc = (globalThis as any)['cc'];
        const js = cc.js;
        const Component = cc.Component;
        return js.isChildClassOf(js.getClassByName(type), Component);
    },

    isCorrectAssetType(type: string): boolean {
        const cc = (globalThis as any)['cc'];
        const js = cc.js;
        const Asset = cc.Asset;
        return js.isChildClassOf(js.getClassByName(type), Asset);
    },

    async createNodeFromPrefab(name: string, prefabUuid: string, parentNodeUuid: string | null): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                const cc = (globalThis as any)['cc'];
                const Node = cc.Node;
                cc.assetManager.loadAny({uuid: prefabUuid}, null, (err : any, prefab : any) => {
                    const newNode = cc.instantiate(prefab);
                    newNode.name = name;
                    if(parentNodeUuid != null) {
                        let parentNode = cc.director.getScene().getChildByUuid(parentNodeUuid);
                        if(parentNode) {
                            parentNode.addChild(newNode);
                        } else {
                            cc.director.getScene().addChild(newNode);
                        }
                    } else {
                        cc.director.getScene().addChild(newNode);
                    }
                    resolve(newNode.uuid);
                });
            } catch(error) {
                reject(error);
            }
        });
    },

    startCaptureSceneLogs() {
        logs.length = 0;
    },

    getCapturedSceneLogs() {
        return logs;
    },

    getLastSceneLogs(count?: number) {
        const requestedCount = count && count > 0 ? Math.min(count, MAX_LOGS) : MAX_LOGS;
        if (allLogs.length <= requestedCount) {
            return allLogs.slice(); // Return copy of all logs
        }
        return allLogs.slice(-requestedCount); // Return last N logs
    },

    async createPrefabFromNode(nodeUuid: string, path: string) {
        try {
            const cce = (globalThis as any)['cce'];
            
            if (!cce || !cce.Prefab || !cce.Prefab.createPrefabAssetFromNode) {
                throw new Error('CCE API not found');
            }

            return await cce.Prefab.createPrefabAssetFromNode(nodeUuid, path);
        } catch (error) {
            console.error('Error creating prefab from node:', error);
            return null;
        }
    },

    async applyPrefabByNode(nodeUuid: string) {
        try {
            const cce = (globalThis as any)['cce'];
            
            if (!cce || !cce.Prefab || !cce.Prefab.applyPrefab) {
                throw new Error('CCE API not found');
            }

            await cce.Prefab.applyPrefab(nodeUuid);
        } catch (error) {
            console.error('Error applying prefab:', error);
            return null;
        }
    },

    async unlinkPrefabByNode(nodeUuid: string, recursive: boolean) {
        try {
            const cce = (globalThis as any)['cce'];
            
            if (!cce || !cce.Prefab || !cce.Prefab.unWrapPrefabInstance) {
                throw new Error('CCE API not found');
            }

            return await cce.Prefab.unWrapPrefabInstance(nodeUuid, recursive);
        } catch (error) {
            console.error('Error applying prefab:', error);
            return false;
        }
    },

    async executeArbitraryCode(code: string, context: any = {}) {
        try {
            // Prepare execution context with commonly used globals
            const cc = (globalThis as any)['cc'];
            const cce = (globalThis as any)['cce'];
            const Editor = (globalThis as any)['Editor'];
            
            // Create a safe execution environment
            const executionContext = {
                cc,
                cce,
                Editor,
                console,
                setTimeout: context.allowTimers ? setTimeout : undefined,
                setInterval: context.allowTimers ? setInterval : undefined,
                clearTimeout: context.allowTimers ? clearTimeout : undefined,
                clearInterval: context.allowTimers ? clearInterval : undefined,
                // Common utilities
                JSON,
                Math,
                Date,
                Array,
                Object,
                String,
                Number,
                Boolean,
                Promise
            };
            
            // Create function with controlled scope
            const func = new Function(
                ...Object.keys(executionContext),
                `
                "use strict";
                try {
                    ${code}
                } catch (error) {
                    throw new Error('Code execution error: ' + error.message);
                }
                `
            );
            
            // Execute with timeout if specified
            const timeout = context.timeout || 10000;
            let timeoutId: NodeJS.Timeout | undefined;
            
            const executionPromise = new Promise((resolve, reject) => {
                try {
                    const result = func(...Object.values(executionContext));
                    
                    // Handle async results
                    if (result && typeof result.then === 'function') {
                        result.then(resolve).catch(reject);
                    } else {
                        resolve(result);
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Code execution timed out after ${timeout}ms`));
                }, timeout);
            });
            
            try {
                const result = await Promise.race([executionPromise, timeoutPromise]);
                if (timeoutId) clearTimeout(timeoutId);
                return result;
            } catch (error) {
                if (timeoutId) clearTimeout(timeoutId);
                throw error;
            }
            
        } catch (error) {
            console.error('Error executing arbitrary code:', error);
            throw error;
        }
    }
};