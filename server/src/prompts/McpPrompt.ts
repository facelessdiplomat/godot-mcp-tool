import type * as z from 'zod/v4';

export interface PromptDefinition<ArgsSchema extends z.ZodObject> {
  readonly title: string;
  readonly description: string;
  readonly argsSchema: ArgsSchema;
}

export interface McpPrompt<ArgsSchema extends z.ZodObject = z.ZodObject> {
  readonly name: string;
  readonly definition: PromptDefinition<ArgsSchema>;
  render(args: z.output<ArgsSchema>): Promise<string>;
}
