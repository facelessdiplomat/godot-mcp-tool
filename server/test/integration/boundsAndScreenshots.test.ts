import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeCaptureScene } from './captureScene.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('bounds and screenshots without a window', () => {
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
    project = new TemporaryProject('MCP bounds', { mainScene: 'res://main.tscn' });
    writeCaptureScene(project);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('measures a mesh of a scene read from disk', async () => {
    const bounds = await tools().call('node_get_bounds', { path: 'Crate', scene: 'res://main.tscn' });

    expect(bounds.text).toBe(
      [
        'Crate (MeshInstance3D) in res://main.tscn, in world coordinates:',
        'center Vector3(4, 1, 0), size Vector3(2, 2, 2)',
        'from Vector3(3, 0, -1) to Vector3(5, 2, 1)',
        'Measured from 1 visual node.',
      ].join('\n'),
    );
  });

  it('measures CSG shapes and the whole scene', async () => {
    const floor = await tools().call('node_get_bounds', { path: 'Floor', scene: 'res://main.tscn' });
    const scene = await tools().call('node_get_bounds', { path: '.', scene: 'res://main.tscn' });

    expect(floor.text).toContain('center Vector3(0, -0.5, 0), size Vector3(20, 1, 20)');
    expect(scene.text).toContain('The scene root (Node3D) in res://main.tscn');
    expect(scene.text).toContain('from Vector3(-10, -1, -10) to Vector3(10, 2, 10)');
    expect(scene.text).toContain('Measured from 2 visual nodes.');
  });

  it('measures several nodes in one call and reports a missing one among them', async () => {
    const measured = await tools().call('node_get_bounds', { paths: ['Crate', 'Floor', 'Crat'], scene: 'res://main.tscn' });

    expect(measured.isError).toBe(false);
    expect(measured.text).toContain('Crate (MeshInstance3D) in res://main.tscn, in world coordinates:\ncenter Vector3(4, 1, 0), size Vector3(2, 2, 2)');
    expect(measured.text).toContain('\n\nFloor (CSGBox3D) in res://main.tscn, in world coordinates:\ncenter Vector3(0, -0.5, 0), size Vector3(20, 1, 20)');
    expect(measured.text).toMatch(/\n\nNode "Crat" not found\nHint: .*Crate/);
  });

  it('explains that the editor cannot render without a window', async () => {
    await tools().call('scene_open', { path: 'res://main.tscn' });

    const screenshot = await tools().call('editor_screenshot');

    expect(screenshot.isError).toBe(true);
    expect(screenshot.text).toContain('without a window');
  });

  it('measures a node of the running game by its collision shape', async () => {
    await tools().call('game_run');
    await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });

    const bounds = await tools().call('node_get_bounds', { path: 'Player', in_game: true });

    expect(bounds.text).toContain('Player (CharacterBody3D) in the running game (res://main.tscn), in world coordinates:');
    expect(bounds.text).toContain('size Vector3(1, 2, 1)');
    expect(bounds.text).toContain('No visual nodes, so measured from 1 collision shape.');
  });

  it('measures several nodes of the running game in one call', async () => {
    const measured = await tools().call('node_get_bounds', { paths: ['Player', 'Floor'], in_game: true });

    expect(measured.text).toContain('Player (CharacterBody3D) in the running game (res://main.tscn), in world coordinates:');
    expect(measured.text).toContain('Floor (CSGBox3D) in the running game (res://main.tscn), in world coordinates:');
  });

  it('checks the views of a game screenshot before it needs a window', async () => {
    const misspelled = await tools().call('game_screenshot', { views: [{ preset: 'front', target: 'Playr' }] });
    const plain = await tools().call('game_screenshot');

    expect(misspelled.isError).toBe(true);
    expect(misspelled.text).toContain('Similar: Player');
    expect(plain.isError).toBe(true);
    expect(plain.text).toContain('without a window');
  });

  it('checks the markers of a view before it needs a window', async () => {
    const misspelled = await tools().call('game_screenshot', { views: [{ preset: 'front', markers: ['Crate', 'Playr'] }] });
    const withoutTarget = await tools().call('editor_screenshot', { views: [{ preset: 'front', markers: 'children' }] });

    expect(misspelled.isError).toBe(true);
    expect(misspelled.text).toContain('Node "Playr" not found');
    expect(misspelled.text).toContain('Similar: Player');
    expect(withoutTarget.isError).toBe(true);
    expect(withoutTarget.text).toContain('View 1: markers "children" marks the children of target; give a target');
  });

  it('plays input even when the screenshot after it cannot be taken', async () => {
    const played = await tools().call('game_input', { steps: [{ wait_ms: 50 }], screenshot: true });

    expect(played.isError).toBe(false);
    expect(played.text).toContain('Played 1 input step in');
    expect(played.text).toContain('No screenshot: The game runs without a window');
  });

  it('casts rays at collision shapes and meshes in the editor and in the game', async () => {
    const onFloor = await tools().call('scene_raycast', { scene: 'res://main.tscn', from: [-3, 10, -3] });
    const onCrate = await tools().call('scene_raycast', { scene: 'res://main.tscn', from: [4, 10, 0] });
    const inGame = await tools().call('scene_raycast', { from: [-3, 10, -3], in_game: true });

    expect(onFloor.text).toContain('hits Floor (CSGBox3D) at Vector3(-3, 0, -3), 10 m away');
    expect(onCrate.text).toContain('hits Crate (MeshInstance3D) at Vector3(4, 2, 0)');
    expect(onCrate.text).toContain('It hit the visible mesh, which has no collision shape there.');
    expect(inGame.text).toContain('hits Floor');
  });

  it('places a lifted crate back on the floor as one Undo step', async () => {
    await tools().call('node_set_properties', { scene: 'res://main.tscn', path: 'Crate', properties: { position: [4, 6, 0] } });

    const snapped = await tools().call('node_snap_to_floor', { scene: 'res://main.tscn', paths: ['Crate'] });
    const crate = await tools().call('node_get_properties', { scene: 'res://main.tscn', path: 'Crate', names: ['position'] });

    expect(snapped.text).toContain('Crate moved down 5 m and rests on Floor, now at Vector3(4, 1, 0).');
    expect(crate.text).toContain('position = Vector3(4, 1, 0)');
  });

  it('gives the crate a box collision that rays then hit', async () => {
    const added = await tools().call('node_add_collision', { scene: 'res://main.tscn', path: 'Crate', shape: 'box' });
    const onCrate = await tools().call('scene_raycast', { scene: 'res://main.tscn', from: [4, 10, 0] });

    expect(added.text).toContain('Added a box collision to Crate in res://main.tscn as one Undo step: Crate/StaticBody3D/CollisionShape3D (BoxShape3D).');
    expect(added.text).toContain('The collision measures Vector3(2, 2, 2); the mesh measures Vector3(2, 2, 2).');
    expect(onCrate.text).toContain('hits Crate/StaticBody3D (StaticBody3D) at Vector3(4, 2, 0)');
    expect(onCrate.text).not.toContain('visible mesh');
  });
});
