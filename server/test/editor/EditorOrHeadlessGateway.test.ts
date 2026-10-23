import { describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { type EditorGateway, EditorUnavailableError } from '../../src/editor/EditorGateway.js';
import { EditorOrHeadlessGateway } from '../../src/editor/EditorOrHeadlessGateway.js';

function gatewayAnswering(answer: () => Promise<unknown>): EditorGateway & { readonly methods: string[] } {
  const methods: string[] = [];
  return {
    methods,
    request: (method) => {
      methods.push(method);
      return answer();
    },
  };
}

describe('asking the editor, or a headless Godot without it', () => {
  it('asks the editor while it is connected', async () => {
    const editor = gatewayAnswering(() => Promise.resolve({ from: 'editor' }));
    const headless = gatewayAnswering(() => Promise.resolve({ from: 'headless' }));

    const answer = await new EditorOrHeadlessGateway(editor, headless).request('project.info', {});

    expect(answer).toEqual({ from: 'editor' });
    expect(headless.methods).toEqual([]);
  });

  it('asks a headless Godot when the editor is not connected', async () => {
    const editor = gatewayAnswering(() => Promise.reject(new EditorUnavailableError('No discovery file')));
    const headless = gatewayAnswering(() => Promise.resolve({ from: 'headless' }));

    const answer = await new EditorOrHeadlessGateway(editor, headless).request('input_map.get', {});

    expect(answer).toEqual({ from: 'headless' });
    expect(headless.methods).toEqual(['input_map.get']);
  });

  it('passes on the errors of a connected editor', async () => {
    const editor = gatewayAnswering(() => Promise.reject(new BridgeRequestError('Unknown setting', -32004, undefined, undefined)));
    const headless = gatewayAnswering(() => Promise.resolve({ from: 'headless' }));

    await expect(new EditorOrHeadlessGateway(editor, headless).request('project.settings_get', {})).rejects.toThrow('Unknown setting');
    expect(headless.methods).toEqual([]);
  });
});
