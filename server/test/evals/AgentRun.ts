import * as z from 'zod/v4';

export interface AgentRun {
  readonly model: string | undefined;
  readonly ended: string;
  readonly turns: number | undefined;
  readonly toolCalls: Readonly<Record<string, number>>;
  readonly failedToolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly costUsd: number | undefined;
  readonly durationMs: number | undefined;
  readonly finalMessage: string;
}

const initSchema = z.object({ type: z.literal('system'), subtype: z.literal('init'), model: z.string() });
const contentBlockSchema = z.object({ type: z.string(), name: z.string().optional(), is_error: z.boolean().optional() });
const messageSchema = z.object({ type: z.enum(['assistant', 'user']), message: z.object({ content: z.array(contentBlockSchema).catch([]) }) });
const resultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean().optional(),
  num_turns: z.number().optional(),
  duration_ms: z.number().optional(),
  total_cost_usd: z.number().optional(),
  result: z.string().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

export function readAgentRun(stream: string): AgentRun {
  let model: string | undefined;
  let result: z.infer<typeof resultSchema> | undefined;
  const toolCalls: Record<string, number> = {};
  let failedToolCalls = 0;
  for (const event of stream.split('\n').flatMap(parsedLine)) {
    const init = initSchema.safeParse(event);
    if (init.success) {
      model = init.data.model;
      continue;
    }
    const message = messageSchema.safeParse(event);
    if (message.success) {
      for (const block of message.data.message.content) {
        if (block.type === 'tool_use' && block.name !== undefined) {
          toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1;
        } else if (block.type === 'tool_result' && block.is_error === true) {
          failedToolCalls += 1;
        }
      }
      continue;
    }
    const finalResult = resultSchema.safeParse(event);
    if (finalResult.success) {
      result = finalResult.data;
    }
  }
  return {
    model,
    ended: endingOf(result),
    turns: result?.num_turns,
    toolCalls,
    failedToolCalls,
    inputTokens: result?.usage?.input_tokens ?? 0,
    outputTokens: result?.usage?.output_tokens ?? 0,
    cacheReadTokens: result?.usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: result?.usage?.cache_creation_input_tokens ?? 0,
    costUsd: result?.total_cost_usd,
    durationMs: result?.duration_ms,
    finalMessage: result?.result ?? '',
  };
}

function endingOf(result: z.infer<typeof resultSchema> | undefined): string {
  if (result === undefined) {
    return 'unfinished';
  }
  return result.is_error === true && result.subtype === 'success' ? 'error' : result.subtype;
}

function parsedLine(line: string): unknown[] {
  if (line.trim() === '') {
    return [];
  }
  try {
    return [JSON.parse(line) as unknown];
  } catch {
    return [];
  }
}
