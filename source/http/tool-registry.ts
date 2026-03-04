/**
 * HTTP adapter for the transport-agnostic ToolRegistry.
 */

import { ToolRegistry } from '../core/tool-registry.js';

export { ToolRegistry };
export type { ToolDefinition, ToolResult } from '../core/tool-contract.js';

let globalRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

export function resetToolRegistry(): void {
  globalRegistry = null;
}
