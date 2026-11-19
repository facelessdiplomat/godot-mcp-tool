import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameOutputCursor } from '../../src/runtime/GameOutputCursor.js';
import { BridgeTool } from '../../src/tools/bridge/BridgeTool.js';
import { createEditorTools } from '../../src/tools/editorTools.js';
import { createGameTools } from '../../src/tools/gameTools.js';
import type { Tool } from '../../src/tools/Tool.js';
import { createEditorRunScriptTool, createFilesystemDeleteTool, createGameEvalTool, createNodeCallMethodTool, createUserDataDeleteTool } from '../../src/tools/unsafeTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

const catalogFile = join(import.meta.dirname, '..', '..', '..', 'addon', 'addons', 'godot_mcp_tool', 'commands', 'command_catalog.gd');

const methodsThatToolsWithoutBridgeToolChangeWith = ['editor.rescan', 'editor.reload_extensions', 'script.rename_in_resources', 'editor.set_plugin_enabled'];
const methodsThatStayOpenWhileChangesAreHeld = ['game.stop'];

function heldMethodsOfTheAddon(): string[] {
  const list = /const METHODS_THAT_CHANGE := \[(?<methods>[^\]]*)\]/.exec(readFileSync(catalogFile, 'utf8'))?.groups?.['methods'] ?? '';
  return [...list.matchAll(/"(?<method>[^"]+)"/g)].map((match) => match.groups?.['method'] ?? '');
}

function bridgeTools(): BridgeTool<never, unknown>[] {
  const editor = new FakeEditorGateway();
  const readCapture = (): Buffer => Buffer.from('');
  const tools: Tool[] = [
    ...createEditorTools(editor, editor, readCapture),
    ...createGameTools(editor, new GameOutputCursor(), readCapture),
    createEditorRunScriptTool(editor),
    createNodeCallMethodTool(editor),
    createGameEvalTool(editor),
    createFilesystemDeleteTool(editor),
    createUserDataDeleteTool(editor),
  ];
  return tools.filter((tool): tool is BridgeTool<never, unknown> => tool instanceof BridgeTool);
}

describe('the commands that Hold Changes in the editor refuses', () => {
  it('are the commands of every tool that changes the project or plays the game, but game_stop', () => {
    const changingMethods = bridgeTools()
      .filter((tool) => tool.definition.annotations.readOnlyHint !== true)
      .map((tool) => tool.method)
      .filter((method) => !methodsThatStayOpenWhileChangesAreHeld.includes(method));

    expect(heldMethodsOfTheAddon().sort()).toEqual([...new Set([...changingMethods, ...methodsThatToolsWithoutBridgeToolChangeWith])].sort());
  });

  it('leave every tool that only reads alone', () => {
    const readingMethods = bridgeTools()
      .filter((tool) => tool.definition.annotations.readOnlyHint === true)
      .map((tool) => tool.method);

    expect(heldMethodsOfTheAddon().filter((method) => readingMethods.includes(method))).toEqual([]);
  });
});
