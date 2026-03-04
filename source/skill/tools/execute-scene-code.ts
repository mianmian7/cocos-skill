import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';

interface CodeExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs?: string[];
  executionTime?: number;
}

/**
 * Execute arbitrary code in the scene context
 */
async function executeCodeInScene(
  code: string, 
  context: {
    timeout?: number;
    returnResult?: boolean;
    captureConsole?: boolean;
  } = {}
): Promise<CodeExecutionResult> {
  const startTime = Date.now();
  
  try {
    // Prepare the code for execution
    let executableCode = code;
    
    // If returnResult is true, wrap the code to capture the result
    if (context.returnResult) {
      executableCode = `
        return (function() {
          ${code}
        })();
      `;
    }
    
    // Execute the code in scene context
    const result = await Editor.Message.request('scene', 'execute-scene-script', {
      name: packageJSON.name,
      method: 'executeArbitraryCode',
      args: [executableCode, context]
    });
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      result: result,
      executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
      executionTime
    };
  }
}

/**
 * Validate code for basic safety checks
 */
function validateCode(code: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /require\s*\(\s*['"`]fs['"`]\s*\)/,
    /require\s*\(\s*['"`]child_process['"`]\s*\)/,
    /process\s*\.\s*exit/,
    /process\s*\.\s*kill/,
    /eval\s*\(/,
    /Function\s*\(/,
    /setTimeout\s*\(/,
    /setInterval\s*\(/,
    /while\s*\(\s*true\s*\)/,
    /for\s*\(\s*;\s*;\s*\)/
  ];
  
  dangerousPatterns.forEach((pattern, index) => {
    if (pattern.test(code)) {
      const patternNames = [
        'File system access',
        'Child process execution',
        'Process termination',
        'Process killing',
        'Dynamic code evaluation',
        'Function constructor',
        'setTimeout usage',
        'setInterval usage',
        'Infinite while loop',
        'Infinite for loop'
      ];
      issues.push(`Potentially dangerous pattern detected: ${patternNames[index]}`);
    }
  });
  
  // Check for excessively long code
  if (code.length > 50000) {
    issues.push('Code is too long (>50KB)');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Get commonly used Cocos Creator APIs documentation
 */
function getApiDocumentation(): string {
  return `
// Commonly used Cocos Creator APIs in scene context:

// Scene Management
// cc.director.getScene() - Get current scene
// cc.director.loadScene(sceneName) - Load scene

// Node Management
// cc.find(path) - Find node by path
// node.getComponent(ComponentType) - Get component
// node.addComponent(ComponentType) - Add component
// node.removeComponent(component) - Remove component

// Transform
// node.position - Get/set position (cc.Vec3)
// node.rotation - Get/set rotation (cc.Quat)
// node.scale - Get/set scale (cc.Vec3)
// node.eulerAngles - Get/set euler angles (cc.Vec3)

// Common Components
// cc.Sprite, cc.Label, cc.Button, cc.RigidBody, cc.Collider
// cc.Animation, cc.ParticleSystem, cc.AudioSource

// Events
// node.on(event, callback) - Listen to events
// node.emit(event, data) - Emit events

// Logging
// console.log(), console.warn(), console.error()

// Available globals:
// cc - Cocos Creator namespace
// Editor - Editor namespace (scene context)
// cce - Editor extensions
  `;
}

export function registerExecuteSceneCodeTool(server: ToolRegistrar): void {
  server.registerTool(
    "execute_scene_code",
    {
      title: "Execute Code in Scene Context",
      description: "Execute TypeScript/JavaScript code in Cocos Creator scene context. Can modify scene state.",
      inputSchema: {
        code: z.string(),
        returnResult: z.boolean().optional().default(false).describe("Capture execution result"),
        timeout: z.number().optional().default(10000).describe("Timeout in milliseconds"),
        captureConsole: z.boolean().optional().default(true).describe("Capture console output"),
        skipValidation: z.boolean().optional().default(false).describe("Skip safety validation"),
        showApiDocs: z.boolean().optional().default(false).describe("Include API docs")
      }
    },
    async ({ 
      code, 
      returnResult, 
      timeout, 
      captureConsole, 
      skipValidation,
      showApiDocs 
    }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { 
        name: packageJSON.name, 
        method: 'startCaptureSceneLogs', 
        args: [] 
      });
      
      try {
        let validationResult: { valid: boolean; issues: string[] } = { valid: true, issues: [] };
        
        // Validate code unless explicitly skipped
        if (!skipValidation) {
          validationResult = validateCode(code);
          if (!validationResult.valid) {
            const warningResult = {
              success: false,
              error: "Code validation failed",
              validationIssues: validationResult.issues,
              suggestion: "Review the code for potential security issues or use skipValidation=true if you trust the code"
            };
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify(warningResult, null, 2)
              }]
            };
          }
        }
        
        // Execute the code
        const result = await executeCodeInScene(code, {
          timeout,
          returnResult,
          captureConsole
        });
        
        // Capture any logs from the execution
        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { 
          name: packageJSON.name, 
          method: 'getCapturedSceneLogs', 
          args: [] 
        });
        
        if (capturedLogs && capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }
        
        // Build response
        const response: any = {
          operation: "execute_scene_code",
          success: result.success,
          result: result.result,
          error: result.error,
          executionTime: result.executionTime,
          logs: result.logs,
          codeLength: code.length,
          validationSkipped: skipValidation
        };
        
        // Include API documentation if requested
        if (showApiDocs) {
          response.apiDocumentation = getApiDocumentation();
        }

        await Editor.Message.request('scene', 'snapshot');
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2)
          }]
        };
        
      } catch (error) {
        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { 
          name: packageJSON.name, 
          method: 'getCapturedSceneLogs', 
          args: [] 
        });
        
        const errorResult = {
          operation: "execute_scene_code",
          success: false,
          error: `Unexpected error during code execution: ${error instanceof Error ? error.message : String(error)}`,
          logs: capturedLogs && capturedLogs.length > 0 ? capturedLogs : undefined,
          codeLength: code.length
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(errorResult, null, 2)
          }]
        };
      }
    }
  );
}
