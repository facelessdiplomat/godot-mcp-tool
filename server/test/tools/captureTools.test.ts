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

  it('game_screenshot takes a strip of frames as one labelled image', async () => {
    const editor = new FakeEditorGateway().respondTo('game.screenshot', {
      path: '/captures/moments-1-001.png',
      width: 1280,
      height: 724,
      original_width: 1280,
      original_height: 724,
      scene: 'res://levels/arena.tscn',
      views: [],
      moments: ['frame 0', 'frame 5', 'frame 10'],
    });

    const result = await createGameScreenshotTool(editor, () => Buffer.from('png')).execute({ frames: 3, every_physics_frames: 5 });

    expect(editor.requests[0]?.params).toEqual({ frames: 3, every_physics_frames: 5, max_size: 1280, format: 'png' });
    expect(editor.requests[0]?.options?.timeoutMs).toBeGreaterThan(30_000);
    expect(result.content[1]).toEqual({
      type: 'text',
      text: 'Screenshots of the running game (res://levels/arena.tscn) at frame 0; frame 5; frame 10, in one labelled image, 1280×724.\nSaved to /captures/moments-1-001.png',
    });
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

  it('editor_screenshot forwards the render mode of a view', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', { ...gameCapture, scene: 'res://levels/arena.tscn', views: ['iso, unshaded', 'iso'] });

    const result = await createEditorScreenshotTool(editor, readPng).execute({ views: [{ preset: 'iso', render: 'unshaded' }, 'iso'] });

    expect(editor.requests[0]?.params).toMatchObject({ views: [{ preset: 'iso', render: 'unshaded' }, 'iso'] });
    expect(textOf(result)).toContain('iso, unshaded, iso');
  });

  it('editor_screenshot forwards markers and lists where each marked node lands in the picture', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', {
      ...gameCapture,
      views: ['iso', 'top of Crates'],
      markers: [
        {
          view: 'iso',
          marks: [
            { number: 1, path: 'Crates/Crate1', position: [212, 140] },
            { number: 2, path: 'Ramp', not_in_view: 'behind the camera' },
          ],
          left_out: 0,
        },
        { view: 'top of Crates', marks: [{ number: 1, path: 'Crates/Crate1', position: [801, 95] }], left_out: 18 },
      ],
    });

    const result = await createEditorScreenshotTool(editor, readPng).execute({
      views: [{ preset: 'iso', markers: ['Crates/Crate1', 'Ramp'] }, { preset: 'top', target: 'Crates', markers: 'children' }],
    });

    expect(editor.requests[0]?.params).toMatchObject({ views: [{ preset: 'iso', markers: ['Crates/Crate1', 'Ramp'] }, { preset: 'top', target: 'Crates', markers: 'children' }] });
    expect(textOf(result)).toContain(
      [
        'Markers in iso: 1 Crates/Crate1 at (212, 140); 2 Ramp not in view (behind the camera).',
        'Markers in top of Crates: 1 Crates/Crate1 at (801, 95); 18 more children are not marked.',
      ].join('\n'),
    );
  });

  it('game_screenshot refuses more than twelve markers in a view before asking the game', async () => {
    const game = new FakeEditorGateway();
    const markers = Array.from({ length: 13 }, (_, index) => `Crate${String(index)}`);

    const result = await createGameScreenshotTool(game, readPng).execute({ views: [{ preset: 'iso', markers }] });

    expect(result.isError).toBe(true);
    expect(game.requests).toHaveLength(0);
  });

  it('game_screenshot rejects an unknown render mode before asking the game', async () => {
    const game = new FakeEditorGateway();

    const result = await createGameScreenshotTool(game, readPng).execute({ views: [{ preset: 'iso', render: 'xray' }] } as never);

    expect(result.isError).toBe(true);
    expect(game.requests).toHaveLength(0);
  });

  it('game_screenshot compares the picture with an earlier one and says where it changed', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', {
      ...gameCapture,
      comparison: { earlier: '/projects/arena/.godot/godot_mcp_tool/captures/game-1.png', sizes_match: true, earlier_size: [1280, 720], mean_difference: 1.234, changed_share: 0.0321, changed_rect: [400, 200, 96, 80], tolerance: 0.1 },
    });

    const text = textOf(await createGameScreenshotTool(game, readPng).execute({ compare_to: '/projects/arena/.godot/godot_mcp_tool/captures/game-1.png' }));

    expect(game.requests[0]?.params).toMatchObject({ compare_to: '/projects/arena/.godot/godot_mcp_tool/captures/game-1.png', tolerance: 0.1 });
    expect(text).toContain(
      'Compared with /projects/arena/.godot/godot_mcp_tool/captures/game-1.png: 3.2% of the pixels changed by more than 0.1, all within [400, 200, 96, 80] (x, y, width, height), outlined in magenta; the mean difference is 1.23 of 255.',
    );
  });

  it('game_screenshot says when the picture matches the earlier one, and when the sizes differ', async () => {
    const game = new FakeEditorGateway().respondTo('game.screenshot', {
      ...gameCapture,
      comparison: { earlier: 'res://shots/start.png', sizes_match: false, earlier_size: [640, 360], mean_difference: 0.2, changed_share: 0, changed_rect: null, tolerance: 0.1 },
    });

    const text = textOf(await createGameScreenshotTool(game, readPng).execute({ compare_to: 'res://shots/start.png' }));

    expect(text).toContain('Compared with res://shots/start.png, scaled from 640×360: no pixel changed by more than 0.1, so the pictures match; the mean difference is 0.2 of 255.');
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

  it('editor_screenshot poses the scene at times of an animation', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', {
      ...gameCapture,
      path: '/captures/editor-1-003.png',
      width: 1280,
      height: 724,
      original_width: 1280,
      original_height: 724,
      views: ['front of Hero'],
      moments: ['walk at 0 s', 'walk at 0.25 s', 'walk at 0.5 s', 'walk at 0.75 s'],
    });

    const result = await createEditorScreenshotTool(editor, readPng).execute({
      views: [{ preset: 'front', target: 'Hero' }],
      animation: { player: 'Hero/AnimationPlayer', name: 'walk' },
    });

    expect(editor.requests[0]?.params).toEqual({
      views: [{ preset: 'front', target: 'Hero' }],
      animation: { player: 'Hero/AnimationPlayer', name: 'walk' },
      max_size: 1280,
      format: 'png',
    });
    expect(textOf(result)).toBe(
      'Poses of res://levels/arena.tscn from front of Hero at walk at 0 s; walk at 0.25 s; walk at 0.5 s; walk at 0.75 s, in one labelled image, 1280×724. The animated values are back as they were.\nSaved to /captures/editor-1-003.png',
    );
  });

  it('editor_screenshot renders a UI scene at several window sizes', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.screenshot', {
      ...gameCapture,
      scene: 'res://ui/hud.tscn',
      path: '/captures/editor-1-004.png',
      width: 1280,
      height: 360,
      original_width: 3368,
      original_height: 1080,
      views: [],
      sizes: ['1920×1080 (16:9)', '1440×1080 (4:3)'],
    });

    const result = await createEditorScreenshotTool(editor, readPng).execute({ sizes: [[1920, 1080], [1440, 1080]] });

    expect(editor.requests[0]?.params).toEqual({ sizes: [[1920, 1080], [1440, 1080]], max_size: 1280, format: 'png' });
    expect(textOf(result)).toBe(
      'Render of res://ui/hud.tscn at 1920×1080 (16:9); 1440×1080 (4:3), laid out like the game window with the stretch settings of the project, in one labelled image, 1280×360 (scaled down from 3368×1080).\nSaved to /captures/editor-1-004.png',
    );
  });
});
