import { z } from 'zod';
import { ToolDefinition, ToolRegistration, ToolResult } from './tool-contract.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private static readonly NUMBER_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

  registerTool(
    name: string,
    definition: ToolRegistration,
    handler: (args: any) => Promise<ToolResult>
  ): void {
    this.tools.set(name, {
      name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      handler
    });
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      const schema = z.object(tool.inputSchema);
      const normalizedArgs = this.normalizeArgsForValidation(args, tool.inputSchema);
      const validatedArgs = schema.parse(normalizedArgs);
      const result = await tool.handler(validatedArgs);

      if (result.content && result.content.length > 0) {
        const textContent = result.content.find((c) => c.type === 'text');
        if (textContent?.text) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }

  private normalizeArgsForValidation(
    args: unknown,
    inputSchema: Record<string, z.ZodTypeAny>
  ): unknown {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return args;
    }

    const normalizedArgs: Record<string, unknown> = { ...(args as Record<string, unknown>) };
    for (const [fieldName, fieldSchema] of Object.entries(inputSchema)) {
      normalizedArgs[fieldName] = this.coerceValueForSchema(fieldSchema, normalizedArgs[fieldName]);
    }

    return normalizedArgs;
  }

  private coerceValueForSchema(fieldSchema: z.ZodTypeAny, value: unknown): unknown {
    if (value === undefined || fieldSchema.safeParse(value).success) {
      return value;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const booleanValue = this.parseBooleanString(value);
    if (booleanValue !== undefined && fieldSchema.safeParse(booleanValue).success) {
      return booleanValue;
    }

    const numberValue = this.parseNumberString(value);
    if (numberValue !== undefined && fieldSchema.safeParse(numberValue).success) {
      return numberValue;
    }

    return value;
  }

  private parseBooleanString(value: string): boolean | undefined {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return undefined;
  }

  private parseNumberString(value: string): number | undefined {
    const normalized = value.trim();
    if (!normalized || !ToolRegistry.NUMBER_PATTERN.test(normalized)) {
      return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
