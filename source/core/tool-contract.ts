import { z } from 'zod';

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: any) => Promise<ToolResult>;
}

export interface ToolRegistration {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

export interface ToolRegistrar {
  registerTool(
    name: string,
    definition: ToolRegistration,
    handler: (args: any) => Promise<ToolResult>
  ): void;
}
