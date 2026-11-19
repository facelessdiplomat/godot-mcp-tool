import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneEditGuard } from '../../src/hooks/SceneEditGuard.js';

const livePid = 4242;
const deadPid = 4343;

describe('keeping Claude from editing scenes and resources as text while the editor has them', () => {
  let workspace: string;
  let projectRoot: string;
  let scenePath: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'scene-edit-'));
    projectRoot = join(workspace, 'game');
    mkdirSync(join(projectRoot, 'levels'), { recursive: true });
    writeFileSync(join(projectRoot, 'project.godot'), 'config_version=5\n');
    scenePath = join(projectRoot, 'levels', 'arena.tscn');
    writeFileSync(scenePath, '[gd_scene format=3]\n');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function writeDiscoveryFile(record: object): void {
    const folder = join(projectRoot, '.godot', 'godot_mcp_tool');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'bridge.json'), JSON.stringify(record));
  }

  function openEditor(pid = livePid): void {
    writeDiscoveryFile({
      protocol: 1,
      port: 50731,
      token: 'secret',
      pid,
      godot_version: '4.8.beta',
      addon_version: '0.2.0',
      project_path: projectRoot,
      executable_path: '/Applications/Godot.app/Contents/MacOS/Godot',
      lsp_port: 6005,
      started_at: '2026-11-19T10:00:00Z',
    });
  }

  function editOf(filePath: string, tool = 'Edit'): unknown {
    return { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' } };
  }

  function check(hookInput: unknown): ReturnType<SceneEditGuard['check']> {
    return new SceneEditGuard((pid) => pid === livePid).check(hookInput);
  }

  it('refuses an edit of a scene that the running editor has, and names the tools to use', () => {
    openEditor();

    const outcome = check(editOf(scenePath));

    expect(outcome.kind).toBe('denied');
    expect(outcome.kind === 'denied' ? outcome.reason : '').toBe(
      [
        'res://levels/arena.tscn was not changed: the Godot editor is open on this project and keeps its own copy of',
        'scenes and resources, so a text edit would break their references or be overwritten when the editor saves.',
        'Change it through the editor with the godot tools instead: scene_batch_edit and the node_ tools for nodes,',
        'properties and signals of a scene, resource_create and resource_set_properties for resources,',
        'audio_buses_set for a bus layout, tileset_add_atlas for a TileSet. Read it first with scene_get_tree,',
        'node_get_properties or resource_get.',
      ].join(' '),
    );
  });

  it('refuses a write over a resource that the running editor has', () => {
    openEditor();
    const materialPath = join(projectRoot, 'stone.tres');
    writeFileSync(materialPath, '[gd_resource type="StandardMaterial3D" format=3]\n');

    expect(check(editOf(materialPath, 'Write'))).toMatchObject({ kind: 'denied' });
  });

  it('lets a new scene be written, since the editor has no copy of it yet', () => {
    openEditor();

    expect(check(editOf(join(projectRoot, 'levels', 'cave.tscn'), 'Write'))).toEqual({ kind: 'silent' });
  });

  it('lets the edit through when the editor was closed', () => {
    writeDiscoveryFile({ closed: true, executable_path: '/Applications/Godot.app/Contents/MacOS/Godot' });

    expect(check(editOf(scenePath))).toEqual({ kind: 'silent' });
  });

  it('lets the edit through when the editor that wrote the discovery file is gone', () => {
    openEditor(deadPid);

    expect(check(editOf(scenePath))).toEqual({ kind: 'silent' });
  });

  it('lets the edit through when no editor ever ran on the project', () => {
    expect(check(editOf(scenePath))).toEqual({ kind: 'silent' });
  });

  it('lets the edit of a scene outside a Godot project through, even beside a project whose editor is open', () => {
    openEditor();
    const looseScene = join(workspace, 'loose.tscn');
    writeFileSync(looseScene, '[gd_scene format=3]\n');

    expect(check(editOf(looseScene))).toEqual({ kind: 'silent' });
  });

  it('lets edits of scripts and other files through', () => {
    openEditor();
    const scriptPath = join(projectRoot, 'player.gd');
    writeFileSync(scriptPath, 'extends Node\n');

    expect(check(editOf(scriptPath))).toEqual({ kind: 'silent' });
    expect(check(editOf(join(projectRoot, 'project.godot')))).toEqual({ kind: 'silent' });
  });

  it('lets input that is not an edit of a file through', () => {
    openEditor();

    expect(check({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })).toEqual({ kind: 'silent' });
    expect(check('not an object')).toEqual({ kind: 'silent' });
  });
});
