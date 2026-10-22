import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeConnectionError, BridgeProtocolError, BridgeRequestError } from '../../bridge/BridgeErrors.js';
import { type EditorGateway, EditorUnavailableError } from '../../editor/EditorGateway.js';
import { errorResult } from '../results.js';
import type { Tool, ToolDefinition } from '../Tool.js';

export interface BridgeToolSpec<InputSchema extends z.ZodObject, Response> {
  readonly name: string;
  readonly definition: ToolDefinition<InputSchema>;
  readonly method: string;
  readonly responseSchema: z.ZodType<Response>;
  readonly present: (response: Response, input: z.output<InputSchema>) => CallToolResult;
  readonly params?: ((input: z.output<InputSchema>) => Record<string, unknown>) | undefined;
  readonly timeoutMs?: number | ((input: z.output<InputSchema>) => number) | undefined;
}

export class BridgeTool<InputSchema extends z.ZodObject, Response> implements Tool<InputSchema> {
  readonly name: string;
  readonly definition: ToolDefinition<InputSchema>;

  constructor(
    private readonly editor: EditorGateway,
    private readonly spec: BridgeToolSpec<InputSchema, Response>,
  ) {
    this.name = spec.name;
    this.definition = spec.definition;
  }

  async execute(input: z.input<InputSchema>): Promise<CallToolResult> {
    const parsedInput = this.definition.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const params = this.spec.params === undefined ? parsedInput.data : this.spec.params(parsedInput.data);
    const timeoutMs = typeof this.spec.timeoutMs === 'function' ? this.spec.timeoutMs(parsedInput.data) : this.spec.timeoutMs;
    let response: unknown;
    try {
      response = await this.editor.request(this.spec.method, params, { timeoutMs });
    } catch (error) {
      return describeRequestFailure(error);
    }
    const parsedResponse = this.spec.responseSchema.safeParse(response);
    if (!parsedResponse.success) {
      return errorResult(
        `The Godot editor sent an unexpected response to "${this.spec.method}". The addon may not match this server version; install the addon that comes with it.\n${z.prettifyError(parsedResponse.error)}`,
      );
    }
    return this.spec.present(parsedResponse.data, parsedInput.data);
  }
}

function describeRequestFailure(error: unknown): CallToolResult {
  if (error instanceof EditorUnavailableError) {
    return errorResult(`The Godot editor is not connected: ${error.message}\nCall godot_status to check the project and the connection.`);
  }
  if (error instanceof BridgeRequestError) {
    return errorResult(error.hint === undefined || error.hint === '' ? error.message : `${error.message}\nHint: ${error.hint}`);
  }
  if (error instanceof BridgeConnectionError || error instanceof BridgeProtocolError) {
    return errorResult(
      `The connection to the Godot editor failed: ${error.message}\nThe editor may have completed the request anyway, so check the result before repeating it. godot_status shows the connection state.`,
    );
  }
  throw error;
}
