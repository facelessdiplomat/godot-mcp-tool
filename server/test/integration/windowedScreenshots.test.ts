import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeCaptureScene } from './captureScene.js';
import { editorStartupTimeoutMs, godotBinary, type ImageOutcome, McpSession, startWindowedEditor, TemporaryProject } from './harness.js';
import { decodePng, type PngImage, type Rgb } from './pngImage.js';

const windowTestsEnabled = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

function decodedImage(outcome: ImageOutcome): PngImage {
  if (outcome.image === undefined) {
    throw new Error(`The result has no image: ${outcome.text}`);
  }
  return decodePng(outcome.image);
}

function centerOf(image: PngImage): Rgb {
  return image.pixel(Math.floor(image.width / 2), Math.floor(image.height / 2));
}

function isRed([red, green, blue]: Rgb): boolean {
  return red > 200 && green < 60 && blue < 60;
}

describe.skipIf(godotBinary === '' || !windowTestsEnabled)('screenshots with a window', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP screenshots', { mainScene: 'res://main.tscn' });
    writeCaptureScene(project);
    editorProcess = await startWindowedEditor(project.root);
    session = await McpSession.connect(project.root);
    await session.call('scene_open', { path: 'res://main.tscn' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('renders a node from a preset angle in the editor', async () => {
    const outcome = await tools().callForImage('editor_screenshot', { views: [{ preset: 'front', target: 'Crate' }] });
    const image = decodedImage(outcome);

    expect(outcome.text).toContain('View of res://main.tscn, 1280×720: front of Crate.');
    expect(outcome.text).not.toContain('preview');
    expect([image.width, image.height]).toEqual([1280, 720]);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it('lays several editor views out in one image', async () => {
    const outcome = await tools().callForImage('editor_screenshot', { views: ['front', 'top', 'iso'] });
    const image = decodedImage(outcome);

    expect(outcome.text).toContain('Views of res://main.tscn, 1280×724, left to right and top to bottom: front, top, iso.');
    expect([image.width, image.height]).toEqual([1280, 724]);
  });

  it('renders from the editor camera', async () => {
    const outcome = await tools().callForImage('editor_screenshot');
    const image = decodedImage(outcome);

    expect(outcome.text).toContain(`from the editor camera, without the grid and gizmos, ${String(image.width)}×${String(image.height)}.`);
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1280);
  });

  it('takes a screenshot of the game window', async () => {
    await tools().call('game_run');

    const outcome = await tools().callForImage('game_screenshot');
    const image = decodedImage(outcome);

    expect(outcome.text).toContain(`Screenshot of the running game (res://main.tscn), ${String(image.width)}×${String(image.height)}.`);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it('renders a view of the running game and leaves its camera alone', async () => {
    const view = await tools().callForImage('game_screenshot', { views: [{ preset: 'top', target: 'Crate' }] });
    const window = await tools().callForImage('game_screenshot');

    expect(view.text).toContain('View of the running game (res://main.tscn), 1280×720: top of Crate.');
    expect(isRed(centerOf(decodedImage(view)))).toBe(true);
    expect(isRed(centerOf(decodedImage(window)))).toBe(true);
  });

  it('takes a screenshot right after playing input', async () => {
    const outcome = await tools().callForImage('game_input', { steps: [{ wait_ms: 100 }], screenshot: true });

    expect(outcome.text).toContain('Played 1 input step in');
    expect(outcome.text).toContain('Screenshot of the running game (res://main.tscn)');
    expect(isRed(centerOf(decodedImage(outcome)))).toBe(true);
  });

  it('sends a jpeg on request', async () => {
    const outcome = await tools().callForImage('game_screenshot', { format: 'jpeg', max_size: 640 });

    expect(outcome.mimeType).toBe('image/jpeg');
    expect(outcome.text).toMatch(/Saved to .+\.jpg$/m);
  });
});
