import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject } from './harness.js';
import { encodeWhitePng } from './pngImage.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const imageWidth = 64;
const imageHeight = 32;

describe.skipIf(godotBinary === '')(`an image added while an editor ${windowed ? 'with' : 'without'} a window runs`, () => {
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
    project = new TemporaryProject('MCP imported texture');
    editorProcess = windowed ? await startWindowedEditor(project.root) : await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('is imported by the first rescan and read with its size and getters', async () => {
    writeFileSync(project?.path('tiles.png') ?? '', encodeWhitePng(imageWidth, imageHeight));

    await tools().call('editor_rescan');
    const texture = await tools().call('resource_get', { path: 'res://tiles.png', names: ['get_height()'] });

    expect(texture.isError).toBe(false);
    expect(texture.text).toContain(`res://tiles.png (CompressedTexture2D, ${String(imageWidth)}×${String(imageHeight)} pixels)`);
    expect(texture.text).toContain(`get_height() = ${String(imageHeight)}  [int]`);
  });
});
