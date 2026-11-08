import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../bridge/BridgeErrors.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool, describeRequestFailure } from './bridge/BridgeTool.js';
import { textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

const inputSchema = z.object({});

const rescanSchema = z.object({ duration_ms: z.number(), reloaded_extensions: z.array(z.string()).default([]) });

type Rescan = z.infer<typeof rescanSchema>;

const rescanTimeoutMs = 90_000;
const reloadRequestTimeoutMs = 10_000;
const methodNotFoundCode = -32601;

export class EditorRescanTool implements Tool<typeof inputSchema> {
  readonly name = 'editor_rescan';

  readonly definition: ToolDefinition<typeof inputSchema> = {
    title: 'Rescan project files',
    description:
      'Make the editor pick up files changed outside it, such as scripts, scenes or assets written to disk and GDExtension libraries rebuilt by a native build: reload the rebuilt GDExtensions, rescan the project, import new assets and reload changed scripts, as the editor does when its window gets focus. Call it after writing files or rebuilding a GDExtension, before using them in scenes or validating scripts that use them.',
    inputSchema,
    annotations: changingAnnotations({ destructive: false, idempotent: true }),
    alwaysLoad: true,
  };

  private readonly rescan: BridgeTool<typeof inputSchema, Rescan>;

  constructor(private readonly editor: EditorGateway) {
    this.rescan = new BridgeTool(editor, {
      name: this.name,
      definition: this.definition,
      method: 'editor.rescan',
      responseSchema: rescanSchema,
      timeoutMs: rescanTimeoutMs,
      present: ({ duration_ms, reloaded_extensions }) => textResult(describeRescan(duration_ms, reloaded_extensions)),
    });
  }

  async execute(input: z.input<typeof inputSchema>): Promise<CallToolResult> {
    const reloadFailure = await this.requestExtensionReload();
    return reloadFailure ?? this.rescan.execute(input);
  }

  private async requestExtensionReload(): Promise<CallToolResult | undefined> {
    try {
      await this.editor.request('editor.reload_extensions', {}, { timeoutMs: reloadRequestTimeoutMs });
      return undefined;
    } catch (error) {
      if (error instanceof BridgeRequestError && error.code === methodNotFoundCode) {
        return undefined;
      }
      return describeRequestFailure(error);
    }
  }
}

function describeRescan(durationMs: number, reloadedExtensions: string[]): string {
  const rescan = `The editor rescanned the project files in ${String(durationMs)} ms and reloaded scripts changed on disk.`;
  if (reloadedExtensions.length === 0) {
    return rescan;
  }
  return `${rescan} It also reloaded the GDExtension libraries rebuilt on disk: ${reloadedExtensions.join(', ')}.`;
}
