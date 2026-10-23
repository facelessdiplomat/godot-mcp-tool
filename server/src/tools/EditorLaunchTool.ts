import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { EditorLaunchError, type EditorLaunchOptions, type EditorLaunchResult } from '../editor/EditorLauncher.js';
import { changingAnnotations } from './annotations.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface EditorStarter {
  launch(options: EditorLaunchOptions): Promise<EditorLaunchResult>;
}

export interface EditorLaunchSettings {
  readonly headlessByDefault: boolean;
}

const editorLaunchInput = z.object({
  headless: z
    .boolean()
    .optional()
    .describe('Start the editor without a window, as on a server; screenshots need a window. Default: with a window, or without one when the server runs with GODOT_MCP_HEADLESS=1.'),
});

export class EditorLaunchTool implements Tool<typeof editorLaunchInput> {
  readonly name = 'editor_launch';

  readonly definition: ToolDefinition<typeof editorLaunchInput> = {
    title: 'Start the editor',
    description:
      'Start the Godot editor for the project and wait until its "Godot MCP Tool" plugin connects, so the editor tools work. Use it when godot_status says the editor is not running. The editor keeps running after this session; it does nothing when the editor is already connected.',
    inputSchema: editorLaunchInput,
    annotations: changingAnnotations({ destructive: false, idempotent: true }),
    alwaysLoad: false,
  };

  constructor(
    private readonly starter: EditorStarter,
    private readonly settings: EditorLaunchSettings = { headlessByDefault: false },
  ) {}

  async execute(input: z.input<typeof editorLaunchInput>): Promise<CallToolResult> {
    const parsedInput = editorLaunchInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    let launched: EditorLaunchResult;
    try {
      launched = await this.starter.launch({ headless: parsedInput.data.headless ?? this.settings.headlessByDefault });
    } catch (error) {
      if (error instanceof EditorLaunchError) {
        return errorResult(error.message);
      }
      throw error;
    }
    const { hello } = launched;
    if (launched.kind === 'already running') {
      return textResult(`The Godot editor is already running for ${hello.projectPath} and connected (Godot ${hello.godotVersion}).`);
    }
    return textResult(
      `Started the Godot editor for ${hello.projectPath}: Godot ${hello.godotVersion} with the plugin ${hello.addonVersion}, connected after ${(launched.waitedMs / 1000).toFixed(1)} s. It keeps running after this session; its output goes to ${launched.logPath}.`,
    );
  }
}
