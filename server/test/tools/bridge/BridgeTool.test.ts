import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { BridgeConnectionError, BridgeRequestError } from '../../../src/bridge/BridgeErrors.js';
import { EditorUnavailableError } from '../../../src/editor/EditorGateway.js';
import { BridgeTool } from '../../../src/tools/bridge/BridgeTool.js';
import { textResult } from '../../../src/tools/results.js';
import { FakeEditorGateway } from '../../support/FakeEditorGateway.js';

const inputSchema = z.object({ path: z.string(), depth: z.number().optional() });

function createTool(editor: FakeEditorGateway): BridgeTool<typeof inputSchema, { echoed: string }> {
  return new BridgeTool(editor, {
    name: 'echo_path',
    definition: { title: 'Echo path', description: 'Echoes a path.', inputSchema, annotations: { readOnlyHint: true }, alwaysLoad: false },
    method: 'echo.path',
    responseSchema: z.object({ echoed: z.string() }),
    present: (response) => textResult(`Echoed ${response.echoed}`),
  });
}

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('BridgeTool', () => {
  it('sends the input as params and presents the response', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', { echoed: 'Player' });

    const result = await createTool(editor).execute({ path: 'Player' });

    expect(editor.requests).toEqual([{ method: 'echo.path', params: { path: 'Player' }, options: { timeoutMs: undefined } }]);
    expect(textOf(result)).toBe('Echoed Player');
    expect(result.isError).toBeFalsy();
  });

  it('turns editor errors into tool errors with the hint', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', new BridgeRequestError('Node "Plyer" not found', -32004, 'Similar: Player.', undefined));

    const result = await createTool(editor).execute({ path: 'Plyer' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Node "Plyer" not found\nHint: Similar: Player.');
  });

  it('explains that the editor is not connected', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', new EditorUnavailableError('The Godot editor is not running for this project.'));

    const result = await createTool(editor).execute({ path: 'Player' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('The Godot editor is not connected');
    expect(textOf(result)).toContain('godot_status');
  });

  it('reports a lost connection', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', new BridgeConnectionError('The editor closed the bridge connection.'));

    const result = await createTool(editor).execute({ path: 'Player' });

    expect(textOf(result)).toContain('The editor closed the bridge connection.');
  });

  it('rejects a response that does not match the expected shape', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', { unexpected: true });

    const result = await createTool(editor).execute({ path: 'Player' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unexpected response');
  });

  it('maps the input to params and picks the timeout per call', async () => {
    const editor = new FakeEditorGateway().respondTo('echo.path', { echoed: 'Player' });
    const tool = new BridgeTool(editor, {
      name: 'echo_path',
      definition: { title: 'Echo path', description: 'Echoes a path.', inputSchema, annotations: {}, alwaysLoad: false },
      method: 'echo.path',
      responseSchema: z.object({ echoed: z.string() }),
      params: (input) => ({ node: input.path, depth: input.depth ?? 1 }),
      timeoutMs: (input) => (input.depth ?? 1) * 1000,
      present: (response) => textResult(response.echoed),
    });

    await tool.execute({ path: 'Player', depth: 3 });

    expect(editor.requests).toEqual([{ method: 'echo.path', params: { node: 'Player', depth: 3 }, options: { timeoutMs: 3000 } }]);
  });
});

