import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { BridgeConnectionError, BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { EditorRescanTool } from '../../src/tools/EditorRescanTool.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('editor_rescan', () => {
  it('reports the duration', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.reload_extensions', {}).respondTo('editor.rescan', { duration_ms: 120 });

    const text = textOf(await new EditorRescanTool(editor).execute({}));

    expect(text).toBe('The editor rescanned the project files in 120 ms and reloaded scripts changed on disk.');
  });

  it('asks the editor to reload rebuilt GDExtensions before it rescans, in a request of its own', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.reload_extensions', {}).respondTo('editor.rescan', { duration_ms: 120 });

    await new EditorRescanTool(editor).execute({});

    expect(editor.requests.map(({ method }) => method)).toEqual(['editor.reload_extensions', 'editor.rescan']);
  });

  it('names the GDExtension libraries the editor reloaded after a rebuild', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('editor.reload_extensions', {})
      .respondTo('editor.rescan', { duration_ms: 120, reloaded_extensions: ['res://bin/game.gdextension', 'res://bin/physics.gdextension'] });

    const text = textOf(await new EditorRescanTool(editor).execute({}));

    expect(text).toBe(
      'The editor rescanned the project files in 120 ms and reloaded scripts changed on disk. It also reloaded the GDExtension libraries rebuilt on disk: res://bin/game.gdextension, res://bin/physics.gdextension.',
    );
  });

  it('says nothing about GDExtensions when none was rebuilt', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.reload_extensions', {}).respondTo('editor.rescan', { duration_ms: 80, reloaded_extensions: [] });

    const text = textOf(await new EditorRescanTool(editor).execute({}));

    expect(text).toBe('The editor rescanned the project files in 80 ms and reloaded scripts changed on disk.');
  });

  it('still rescans with an addon that cannot reload GDExtensions yet', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('editor.reload_extensions', new BridgeRequestError('Method not found: editor.reload_extensions', -32601, undefined, undefined))
      .respondTo('editor.rescan', { duration_ms: 95 });

    const result = await new EditorRescanTool(editor).execute({});

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toBe('The editor rescanned the project files in 95 ms and reloaded scripts changed on disk.');
  });

  it('reports a lost connection during the reload request and does not rescan', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.reload_extensions', new BridgeConnectionError('The connection closed'));

    const result = await new EditorRescanTool(editor).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('The connection to the Godot editor failed: The connection closed');
    expect(editor.requests.map(({ method }) => method)).toEqual(['editor.reload_extensions']);
  });
});
