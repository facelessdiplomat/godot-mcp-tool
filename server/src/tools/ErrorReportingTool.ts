import type { CallToolResult } from '@modelcontextprotocol/server';
import type * as z from 'zod/v4';
import type { ErrorSummary } from '../runtime/ErrorSummary.js';
import type { Tool, ToolDefinition } from './Tool.js';

export class ErrorReportingTool<InputSchema extends z.ZodObject = z.ZodObject> implements Tool<InputSchema> {
  constructor(
    private readonly tool: Tool<InputSchema>,
    private readonly summary: ErrorSummary,
  ) {}

  get name(): string {
    return this.tool.name;
  }

  get definition(): ToolDefinition<InputSchema> {
    return this.tool.definition;
  }

  async execute(input: z.input<InputSchema>): Promise<CallToolResult> {
    const result = await this.tool.execute(input);
    if (this.tool.definition.showsErrors === true) {
      this.summary.acknowledge();
      return result;
    }
    const summary = this.summary.takeSummary();
    return summary === undefined ? result : { ...result, content: appendText(result.content, summary) };
  }
}

function appendText(content: CallToolResult['content'], text: string): CallToolResult['content'] {
  const last = content.at(-1);
  if (last?.type !== 'text') {
    return [...content, { type: 'text', text }];
  }
  return [...content.slice(0, -1), { ...last, text: `${last.text}\n\n${text}` }];
}
