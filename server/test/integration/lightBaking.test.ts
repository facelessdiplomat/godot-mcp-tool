import type { ChildProcess } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject } from './harness.js';

const windowTestsEnabled = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const room = 'res://room.tscn';
const bakeTimeoutMs = 120_000;
const someBakedDataBytes = 10_000;

const roomOperations = [
  { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { position: [0, -0.5, 0], size: [10, 1, 10] } },
  { op: 'node_add', type: 'CSGBox3D', name: 'Wall', properties: { position: [0, 1.5, -4.5], size: [10, 3, 1] } },
  { op: 'node_add', type: 'VoxelGI', name: 'VoxelGI', properties: { position: [0, 2, 0], size: [12, 6, 12] } },
  { op: 'node_add', type: 'VoxelGI', name: 'Empty', properties: { position: [100, 0, 0], size: [4, 4, 4] } },
];

class EditorSession {
  private project: TemporaryProject | undefined;
  private editorProcess: ChildProcess | undefined;
  private session: McpSession | undefined;

  async start(name: string, windowed: boolean): Promise<void> {
    this.project = new TemporaryProject(name);
    this.editorProcess = windowed ? await startWindowedEditor(this.project.root) : await startHeadlessEditor(this.project.root);
    this.session = await McpSession.connect(this.project.root);
    await this.tools().call('scene_create', { path: room, root_type: 'Node3D' });
    await this.tools().call('scene_batch_edit', { operations: roomOperations });
    await this.tools().call('scene_save');
  }

  tools(): McpSession {
    if (this.session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return this.session;
  }

  files(): TemporaryProject {
    if (this.project === undefined) {
      throw new Error('The project was not created');
    }
    return this.project;
  }

  async stop(): Promise<void> {
    await this.session?.close();
    this.editorProcess?.kill('SIGKILL');
    this.project?.remove();
  }
}

describe.skipIf(godotBinary === '')('baking a VoxelGI without a window', () => {
  const editor = new EditorSession();

  beforeAll(() => editor.start('MCP light baking headless', false), editorStartupTimeoutMs);
  afterAll(() => editor.stop());

  it('refuses and says that the bake needs the editor with a window', async () => {
    const refused = await editor.tools().call('voxelgi_bake', {});

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('Baking a VoxelGI needs the editor with a window');
    expect(refused.text).toContain('editor_launch');
    expect(existsSync(editor.files().path('room.VoxelGI_data.res'))).toBe(false);
  });
});

describe.skipIf(godotBinary === '' || !windowTestsEnabled)('baking a VoxelGI with a window', () => {
  const editor = new EditorSession();

  beforeAll(() => editor.start('MCP light baking', true), editorStartupTimeoutMs);
  afterAll(() => editor.stop());

  it('bakes each VoxelGI into a file next to the scene and names the one that found nothing to bake', async () => {
    const baked = await editor.tools().call('voxelgi_bake', {});

    expect(baked.isError).toBe(false);
    expect(baked.text).toContain('Baked the VoxelGI nodes VoxelGI, Empty of res://room.tscn as one Undo step');
    expect(baked.text).toMatch(/^- VoxelGI: 128 subdivisions over 12 × 6 × 12 m, data in res:\/\/room\.VoxelGI_data\.res \([\d.]+ [KM]B\)$/m);
    expect(baked.text).toMatch(/^- Empty: .*, but it found no mesh or CSG shape with GI mode Static inside its box/m);
    expect(statSync(editor.files().path('room.VoxelGI_data.res')).size).toBeGreaterThan(someBakedDataBytes);
  }, bakeTimeoutMs);

  it('keeps the link to the data in the saved scene, and takes it back with Undo', async () => {
    await editor.tools().call('scene_save');
    const saved = editor.files().read('room.tscn');
    const undone = await editor.tools().call('editor_undo', {});
    const afterUndo = await editor.tools().call('node_get_properties', { path: 'VoxelGI', names: ['data'] });

    expect(saved, saved).toMatch(/\[ext_resource type="VoxelGIData"[^\]]*path="res:\/\/room\.VoxelGI_data\.res"/);
    expect(undone.text).toContain('MCP: Bake VoxelGI');
    expect(afterUndo.text).toMatch(/data = null/);
  });
});
