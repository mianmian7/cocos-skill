import { z } from 'zod';
import { ToolDefinition, ToolRegistration, ToolResult } from './tool-contract.js';

export class ToolValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = 'ToolValidationError';
    this.issues = issues;
  }
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private static readonly NUMBER_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
  private static readonly ARG_WRAPPER_KEYS = [
    'arguments',
    'args',
    'input',
    'payload',
    'body',
    'parameters',
    'params',
  ] as const;
  private static readonly MAX_ARGS_UNWRAP_DEPTH = 4;

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
        throw new ToolValidationError(`Validation error: ${error.message}`, error.issues);
      }
      throw error;
    }
  }

  private normalizeArgsForValidation(
    args: unknown,
    inputSchema: Record<string, z.ZodTypeAny>
  ): unknown {
    const unwrappedArgs = this.unwrapArgsBySchema(args, inputSchema);
    if (!this.isRecord(unwrappedArgs)) {
      return unwrappedArgs;
    }

    const normalizedArgs: Record<string, unknown> = { ...unwrappedArgs };
    for (const [fieldName, fieldSchema] of Object.entries(inputSchema)) {
      normalizedArgs[fieldName] = this.coerceValueForSchema(fieldSchema, normalizedArgs[fieldName]);
    }

    return normalizedArgs;
  }

  private unwrapArgsBySchema(
    args: unknown,
    inputSchema: Record<string, z.ZodTypeAny>
  ): unknown {
    const schemaKeys = Object.keys(inputSchema);
    let currentArgs = this.tryParseJsonPayload(args);

    for (let depth = 0; depth < ToolRegistry.MAX_ARGS_UNWRAP_DEPTH; depth++) {
      if (!this.isRecord(currentArgs) || this.hasAnySchemaKey(currentArgs, schemaKeys)) {
        return currentArgs;
      }

      const nextArgs = this.findWrappedArgs(currentArgs, schemaKeys);
      if (nextArgs === undefined) {
        return currentArgs;
      }
      currentArgs = nextArgs;
    }

    return currentArgs;
  }

  private findWrappedArgs(
    payload: Record<string, unknown>,
    schemaKeys: string[]
  ): unknown {
    for (const wrapperKey of ToolRegistry.ARG_WRAPPER_KEYS) {
      if (!(wrapperKey in payload)) {
        continue;
      }
      const candidate = this.tryParseJsonPayload(payload[wrapperKey]);
      if (!this.isRecord(candidate)) {
        continue;
      }
      if (this.hasAnySchemaKey(candidate, schemaKeys) || this.hasAnyWrapperKey(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private hasAnySchemaKey(payload: Record<string, unknown>, schemaKeys: string[]): boolean {
    return schemaKeys.some((key) => key in payload);
  }

  private hasAnyWrapperKey(payload: Record<string, unknown>): boolean {
    return ToolRegistry.ARG_WRAPPER_KEYS.some((key) => key in payload);
  }

  private tryParseJsonPayload(value: unknown): unknown {
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
