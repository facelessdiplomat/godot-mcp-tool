import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
      expect(reference.text).toContain('- velocity: Vector3 — ');
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
