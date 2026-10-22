import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createSignalConnectTool, createSignalDisconnectTool, createSignalListTool } from '../../src/tools/signalTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const pressedConnection = { from: 'Button', signal: 'pressed', to: '.', method: '_on_button_pressed', flags: [], binds: [] };

describe('signal tools', () => {
  it('signal_list lists the connections saved in a scene', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.list', {
      scene: 'res://main.tscn',
      connections: [
        pressedConnection,
        { from: 'Door/Area', signal: 'body_entered', to: 'Door', method: '_on_body_entered', flags: ['deferred'], binds: ['north'] },
      ],
    });

    const result = await createSignalListTool(editor).execute({});

    expect(textOf(result)).toBe(
      [
        'Signal connections saved in res://main.tscn:',
        'Button.pressed → _on_button_pressed() on the scene root',
        'Door/Area.body_entered → _on_body_entered() on Door [deferred] with binds ["north"]',
      ].join('\n'),
    );
  });

  it('signal_list says when a scene has no connections', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.list', { scene: 'res://main.tscn', connections: [] });

    expect(textOf(await createSignalListTool(editor).execute({}))).toBe('res://main.tscn has no saved signal connections. signal_connect adds one.');
  });

  it('signal_list shows the signals of a node with their arguments and connections', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.list', {
      scene: 'res://main.tscn',
      path: 'Area',
      type: 'Area3D',
      signals: [
        { name: 'body_entered', arguments: 'body: Node3D', connections: [{ ...pressedConnection, from: 'Area', signal: 'body_entered', method: '_on_body_entered' }] },
        { name: 'body_exited', arguments: 'body: Node3D', connections: [] },
        { name: 'ready', arguments: '', connections: [] },
      ],
    });

    const result = await createSignalListTool(editor).execute({ path: 'Area' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Area' });
    expect(textOf(result)).toBe(
      [
        'Signals of Area (Area3D) in res://main.tscn:',
        'body_entered(body: Node3D)',
        '  → _on_body_entered() on the scene root',
        'body_exited(body: Node3D)',
        'ready()',
      ].join('\n'),
    );
  });

  it('signal_connect reports the new connection', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.connect', { scene: 'res://main.tscn', ...pressedConnection, flags: ['one_shot'], already_connected: false });

    const result = await createSignalConnectTool(editor).execute({ from: 'Button', signal: 'pressed', method: '_on_button_pressed', one_shot: true });

    expect(editor.requests[0]?.params).toEqual({ from: 'Button', signal: 'pressed', to: '.', method: '_on_button_pressed', deferred: false, one_shot: true });
    expect(textOf(result)).toBe('Connected Button.pressed to _on_button_pressed() on the scene root [one_shot] in res://main.tscn. The scene has unsaved changes.');
  });

  it('signal_connect says when the connection already exists', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.connect', { scene: 'res://main.tscn', ...pressedConnection, already_connected: true });

    const result = await createSignalConnectTool(editor).execute({ from: 'Button', signal: 'pressed', method: '_on_button_pressed' });

    expect(textOf(result)).toBe('Button.pressed was already connected to _on_button_pressed() on the scene root; nothing changed.');
  });

  it('signal_disconnect reports the removed connection', async () => {
    const editor = new FakeEditorGateway().respondTo('signal.disconnect', { scene: 'res://main.tscn', from: 'Button', signal: 'pressed', to: '.', method: '_on_button_pressed' });

    const result = await createSignalDisconnectTool(editor).execute({ from: 'Button', signal: 'pressed', method: '_on_button_pressed' });

    expect(textOf(result)).toBe('Disconnected Button.pressed from _on_button_pressed() on the scene root in res://main.tscn. The scene has unsaved changes.');
  });
});
