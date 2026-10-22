import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { EditorLaunchError, type EditorLaunchOptions, type EditorLaunchResult } from '../../src/editor/EditorLauncher.js';
import { EditorLaunchTool } from '../../src/tools/EditorLaunchTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const hello = { protocol: 1, godotVersion: '4.8.beta.custom_build', addonVersion: '0.1.0', projectPath: '/games/arena', executablePath: '/opt/godot', methods: [] };

function starterAnswering(outcome: EditorLaunchResult | Error): { readonly requests: EditorLaunchOptions[]; launch(options: EditorLaunchOptions): Promise<EditorLaunchResult> } {
  const requests: EditorLaunchOptions[] = [];
  return {
    requests,
    launch: (options) => {
      requests.push(options);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

describe('editor_launch', () => {
  it('starts the editor and says where its output goes', async () => {
    const starter = starterAnswering({ kind: 'started', hello, pid: 4321, waitedMs: 7400, logPath: '/games/arena/.godot/godot_mcp_tool/editor.log' });

    const result = await new EditorLaunchTool(starter).execute({});

    expect(starter.requests).toEqual([{ headless: false }]);
    expect(textOf(result)).toBe(
      'Started the Godot editor for /games/arena: Godot 4.8.beta.custom_build with the plugin 0.1.0, connected after 7.4 s. It keeps running after this session; its output goes to /games/arena/.godot/godot_mcp_tool/editor.log.',
    );
  });

  it('says when the editor is already running', async () => {
    const result = await new EditorLaunchTool(starterAnswering({ kind: 'already running', hello })).execute({ headless: true });

    expect(textOf(result)).toBe('The Godot editor is already running for /games/arena and connected (Godot 4.8.beta.custom_build).');
  });

  it('reports why the editor did not start', async () => {
    const result = await new EditorLaunchTool(starterAnswering(new EditorLaunchError('No Godot executable was found.'))).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('No Godot executable was found.');
  });
});
