import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { godotBinary, McpSession, TemporaryProject } from './harness.js';

const goblinScript = [
  'class_name Goblin',
  'extends CharacterBody3D',
  '## A small enemy that chases the player.',
  '##',
  '## Goblins walk toward the nearest player.',
  '',
  '## How fast the goblin walks, in meters per second.',
  '@export var speed := 3.5',
  '',
  '',
  '## Makes the goblin chase [param target].',
  'func chase(target: Node3D) -> void:',
  '\tpass',
  '',
].join('\n');

const firstCallTimeoutMs = 120_000;

describe.skipIf(godotBinary === '')('the class reference without the editor', () => {
  let project: TemporaryProject | undefined;
  let cacheDirectory = '';
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP docs');
    mkdirSync(project.path('enemies'));
    project.write('enemies/goblin.gd', goblinScript);
    cacheDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'godot-mcp-docs-cache-')));
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary, GODOT_MCP_CACHE_DIR: cacheDirectory });
  });

  afterAll(async () => {
    await session?.close();
    project?.remove();
    rmSync(cacheDirectory, { recursive: true, force: true });
  });

  it(
    'shows an engine class with its ancestry and members',
    async () => {
      const reference = await tools().call('docs_class', { name: 'CharacterBody3D' });

      expect(reference.isError).toBe(false);
      expect(reference.text).toContain('CharacterBody3D — engine class');
      expect(reference.text).toContain('Inherits: PhysicsBody3D < CollisionObject3D < Node3D < Node < Object');
      expect(reference.text).toContain('- move_and_slide() -> bool — ');
      expect(reference.text).toMatch(/- velocity: Vector3( = Vector3\(0, 0, 0\))? — /);
    },
    firstCallTimeoutMs,
  );

  it('shows one member in full and finds global functions', async () => {
    const member = await tools().call('docs_class', { name: 'CharacterBody3D', member: 'move_and_slide' });
    const inherited = await tools().call('docs_class', { name: 'CharacterBody3D.look_at' });
    const lerp = await tools().call('docs_class', { name: 'lerp' });

    expect(member.text).toMatch(/^CharacterBody3D\.move_and_slide\(\) -> bool\nMethod of CharacterBody3D\.\n\nMoves the body based on `velocity`\./);
    expect(inherited.text).toContain('Method of Node3D, inherited by CharacterBody3D.');
    expect(lerp.text).toContain('@GlobalScope.lerp(');
  });

  it('documents the classes of the project from their doc comments', async () => {
    const goblin = await tools().call('docs_class', { name: 'Goblin' });

    expect(goblin.text).toContain('Goblin — class of this project, res://enemies/goblin.gd');
    expect(goblin.text).toContain('Inherits: CharacterBody3D < PhysicsBody3D');
    expect(goblin.text).toContain('A small enemy that chases the player.');
    expect(goblin.text).toContain('- speed: float = 3.5 — How fast the goblin walks, in meters per second.');
    expect(goblin.text).toContain('- chase(target: Node3D) -> void — Makes the goblin chase `target`.');
  });

  it.skipIf(!existsSync(join(homedir(), 'Library', 'Caches', 'Godot', 'editor_doc_cache-4.8.res')) && !existsSync(join(homedir(), '.cache', 'godot', 'editor_doc_cache-4.8.res')))(
    'shows the annotations of GDScript and the default values of engine properties from the help of the editor',
    async () => {
      const page = await tools().call('docs_class', { name: '@GDScript' });
      const exportRange = await tools().call('docs_class', { name: '@GDScript', member: '@export_range' });
      const body = await tools().call('docs_class', { name: 'CharacterBody3D', member: 'floor_max_angle' });
      const overview = await tools().call('docs_class', { name: 'Node3D' });

      expect(page.text).toContain('@GDScript — annotations and functions of GDScript');
      expect(page.text).toMatch(/Annotations:\n- @abstract/);
      expect(page.text).toContain('- preload(path: String) -> Resource');
      expect(exportRange.text).toMatch(/^@GDScript\.@export_range\(min: float, max: float, step: float = 1\.0, extra_hints: String = "", \.\.\.\)\nAnnotation of @GDScript\./);
      expect(overview.text).toContain('position: Vector3 = Vector3(0, 0, 0)');
      expect(body.text).toContain('floor_max_angle');
    },
    firstCallTimeoutMs,
  );

  it('searches classes and members', async () => {
    const results = await tools().call('docs_search', { query: 'raycast' });

    expect(results.text).toContain('- RayCast3D (class) — ');
  });

  it('suggests a class for a misspelled name', async () => {
    const missing = await tools().call('docs_class', { name: 'CharacterBody' });

    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('CharacterBody3D');
  });
});
