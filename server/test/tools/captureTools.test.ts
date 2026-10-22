import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createEditorScreenshotTool, createGameScreenshotTool } from '../../src/tools/captureTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function readPng(): Buffer {
  return pngBytes;
}

function textOf(result: CallToolResult): string {
  return result.content.flatMap((content) => (content.type === 'text' ? [content.text] : [])).join('\n');
}

const gameCapture = {
  path: '/project/.godot/godot_mcp_tool/captures/game-1-001.png',
  width: 1152,
  height: 648,
  original_width: 1152,
  original_height: 648,
  scene: 'res://levels/arena.tscn',
  views: [],
};

const lightingNote = 'The scene has no DirectionalLight3D or WorldEnvironment of its own, so this render is lit by the editor preview.';

describe('capture tools', () => {
  it('game_screenshot returns the image of the game window with its file', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', gameCapture);

    const result = await createGameScreenshotTool(game, readPng).execute({});

    expect(game.requests[0]?.params).toEqual({ max_size: 1280, format: 'png' });
    expect(result.content[0]).toEqual({ type: 'image', data: pngBytes.toString('base64'), mimeType: 'image/png' });
    expect(textOf(result)).toBe(
      'Screenshot of the running game (res://levels/arena.tscn), 1152×648.\nSaved to /project/.godot/godot_mcp_tool/captures/game-1-001.png',
    );
  });

  it('game_screenshot forwards the views and names them in order', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', {
      ...gameCapture,
      width: 1279,
      height: 482,
      original_width: 1279,
      original_height: 482,
      views: ['front', 'iso', 'top of Player'],
    });

    const result = await createGameScreenshotTool(game, readPng).execute({ views: ['front', 'iso', { preset: 'top', target: 'Player' }] });

    expect(game.requests[0]?.params).toEqual({ views: ['front', 'iso', { preset: 'top', target: 'Player' }], max_size: 1280, format: 'png' });
    expect(textOf(result)).toContain('Views of the running game (res://levels/arena.tscn), 1279×482, left to right and top to bottom: front, iso, top of Player.');
  });

  it('game_screenshot tells where clicks land when the image is scaled down', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', { ...gameCapture, width: 1280, height: 720, original_width: 2560, original_height: 1440 });

    const result = await createGameScreenshotTool(game, readPng).execute({});

    expect(textOf(result)).toContain('1280×720 (scaled down from 2560×1440). Clicks for game_input use the 2560×1440 game view.');
  });

  it('game_screenshot sends a jpeg with its type', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', { ...gameCapture, path: '/captures/game-1-002.jpg' });

    const result = await createGameScreenshotTool(game, readPng).execute({ format: 'jpeg' });

    expect(result.content[0]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });
  });

  it('game_screenshot reports a file it cannot read', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', gameCapture);

    const result = await createGameScreenshotTool(game, () => {
      throw new Error('ENOENT: no such file or directory');
    }).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('/project/.godot/godot_mcp_tool/captures/game-1-001.png');
    expect(textOf(result)).toContain('ENOENT');
  });

  it('game_screenshot rejects an unknown preset before asking the game', async () => {
    const game = new FakeEditorGateway();

    const result = await createGameScreenshotTool(game, readPng).execute({ views: ['diagonal'] } as never);

    expect(result.isError).toBe(true);
    expect(game.requests).toHaveLength(0);
  });

  it('game_screenshot waits longer than the game does for a frame', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', gameCapture);

    await createGameScreenshotTool(game, readPng).execute({});

    expect(game.requests[0]?.options?.timeoutMs).toBeGreaterThan(30_000);
  });

  it('editor_screenshot renders from the editor camera and passes on the lighting note', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', {
      ...gameCapture,
      path: '/captures/editor-1-001.png',
      width: 1280,
      height: 667,
      original_width: 1280,
      original_height: 667,
      views: ['editor camera'],
      note: lightingNote,
    });

    const result = await createEditorScreenshotTool(editor, readPng).execute({});

    expect(editor.requests[0]?.method).toBe('editor.screenshot');
    expect(textOf(result)).toBe(
      `Render of res://levels/arena.tscn from the editor camera, without the grid and gizmos, 1280×667.\n${lightingNote}\nSaved to /captures/editor-1-001.png`,
    );
  });

  it('editor_screenshot names a single view', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', {
      ...gameCapture,
      path: '/captures/editor-1-002.png',
      width: 1280,
      height: 720,
      original_width: 1280,
      original_height: 720,
      views: ['front of Player'],
    });

    const result = await createEditorScreenshotTool(editor, readPng).execute({ views: [{ preset: 'front', target: 'Player' }] });

    expect(textOf(result)).toBe('View of res://levels/arena.tscn, 1280×720: front of Player.\nSaved to /captures/editor-1-002.png');
  });
});
