import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import type * as z from 'zod/v4';

export interface ToolDefinition<InputSchema extends z.ZodObject> {
  readonly title: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  readonly annotations: ToolAnnotations;
  readonly alwaysLoad: boolean;
}

export interface Tool<InputSchema extends z.ZodObject = z.ZodObject> {
  readonly name: string;
  readonly definition: ToolDefinition<InputSchema>;
  execute(input: z.infer<InputSchema>): Promise<CallToolResult>;
}
