import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const fileTimeResolutionMs = 1_100;

async function waitForNewModificationTime(): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, fileTimeResolutionMs));
}

describe.skipIf(godotBinary === '')('saving scenes while scripts change on disk', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;
  let helper: EditorTestHelper | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function user(): EditorTestHelper {
    if (helper === undefined) {
      throw new Error('The editor test helper is not ready');
    }
    return helper;
  }

  function files(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The temporary project was not created');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP script conflicts', { withTestHelper: true });
    project.write('player.gd', 'extends Node3D\nvar speed := 1.0\n');
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    helper = new EditorTestHelper(project);
    await session.call('scene_create', { path: 'res://main.tscn', root_type: 'Node3D' });
    await session.call('node_set_properties', { path: '.', properties: { script: 'res://player.gd' } });
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('refuses to save over a script that changed on disk while the editor has unsaved changes to it', async () => {
    const typed = await user().request('type_in_script', { path: 'res://player.gd', text: '\nvar typed_in_editor := true' });
    await waitForNewModificationTime();
    files().write('player.gd', 'extends Node3D\nvar speed := 2.0\n');

    const saved = await tools().call('scene_save');

    expect(typed['unsaved']).toEqual(['res://player.gd']);
    expect(saved.isError).toBe(true);
    expect(saved.text).toContain('res://player.gd');
    expect(saved.text).toContain('Reload from disk');
    expect(files().read('player.gd')).toBe('extends Node3D\nvar speed := 2.0\n');
  });

  it('saves once the user reloads the script from disk', async () => {
    const reloaded = await user().request('reload_from_disk');

    const saved = await tools().call('scene_save');

    expect(reloaded['reloaded']).toBe(true);
    expect(saved).toEqual({ isError: false, text: 'Saved res://main.tscn.' });
    expect(files().read('player.gd')).toBe('extends Node3D\nvar speed := 2.0\n');
  });

  it('picks up a newer script on disk when the editor has no unsaved changes to it', async () => {
    await waitForNewModificationTime();
    files().write('player.gd', 'extends Node3D\nvar speed := 3.0\n');

    const saved = await tools().call('scene_save');

    expect(saved).toEqual({ isError: false, text: 'Saved res://main.tscn.' });
    expect(files().read('player.gd')).toBe('extends Node3D\nvar speed := 3.0\n');
  });

  it('reports the unsaved editor changes that saving writes to disk', async () => {
    await user().request('type_in_script', { path: 'res://player.gd', text: '\nvar typed_in_editor := true' });

    const saved = await tools().call('scene_save');

    expect(saved.text).toContain('The editor also saved unsaved changes from its script editor to res://player.gd');
    expect(files().read('player.gd')).toContain('var typed_in_editor := true');
  });
});
