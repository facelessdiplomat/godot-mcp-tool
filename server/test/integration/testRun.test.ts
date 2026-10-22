import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, TemporaryProject, testProjectRoot } from './harness.js';

const testRunTimeoutMs = 120_000;
const gdUnitInstalled = existsSync(join(testProjectRoot, 'addons', 'gdUnit4'));

const playerScript = ['class_name Player', 'extends CharacterBody3D', '', 'const DASH_SPEED := 12.0', '', '', 'func dash(direction: Vector3) -> void:', '\tvelocity = direction.normalized() * DASH_SPEED', ''].join(
  '\n',
);

const gutPlayerTests = [
  'extends GutTest',
  '',
  '',
  'func test_dash_moves_at_dash_speed() -> void:',
  '\tvar player: Player = autofree(Player.new())',
  '\tplayer.dash(Vector3.FORWARD)',
  '\tassert_almost_eq(player.velocity.length(), 12.0, 0.001)',
  '',
  '',
  'func test_dash_keeps_the_direction() -> void:',
  '\tvar player: Player = autofree(Player.new())',
  '\tplayer.dash(Vector3.RIGHT * 3.0)',
  '\tassert_eq(player.velocity.normalized(), Vector3.LEFT)',
  '',
].join('\n');

const gdUnitPlayerTests = [
  'extends GdUnitTestSuite',
  '',
  '',
  'func test_dash_moves_at_dash_speed() -> void:',
  '\tvar player: Player = auto_free(Player.new())',
  '\tplayer.dash(Vector3.FORWARD)',
  '\tassert_float(player.velocity.length()).is_equal_approx(12.0, 0.001)',
  '',
  '',
  'func test_dash_keeps_the_direction() -> void:',
  '\tvar player: Player = auto_free(Player.new())',
  '\tplayer.dash(Vector3.RIGHT * 3.0)',
  '\tassert_vector(player.velocity.normalized()).is_equal(Vector3.LEFT)',
  '',
].join('\n');

function sessionTools(session: McpSession | undefined): McpSession {
  if (session === undefined) {
    throw new Error('The MCP client is not connected');
  }
  return session;
}

describe.skipIf(godotBinary === '')('running GUT tests', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  beforeAll(async () => {
    project = new TemporaryProject('MCP GUT tests', { testFramework: 'gut' });
    mkdirSync(project.path('test'));
    project.write('player.gd', playerScript);
    project.write('test/test_player.gd', gutPlayerTests);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    if (project !== undefined) {
      const discovered = new DiscoveryFileReader(project.root, isProcessAlive).read();
      if (discovered.kind === 'found') {
        process.kill(discovered.endpoint.pid, 'SIGKILL');
      }
      project.remove();
    }
  });

  it(
    'runs the tests without the editor and reports the failure with its line',
    async () => {
      const result = await sessionTools(session).call('test_run');

      expect(result.isError).toBe(false);
      expect(result.text).toMatch(/^Ran 2 tests in 1 script with GUT \(res:\/\/test, \d+\.\d s\): 1 passed, 1 failed\.\nFailed:\n/);
      expect(result.text).toContain('- test_dash_keeps_the_direction (res://test/test_player.gd:13)');
      expect(result.text).toContain('expected to equal');
    },
    testRunTimeoutMs,
  );

  it(
    'runs only the tests whose names match',
    async () => {
      const result = await sessionTools(session).call('test_run', { name: 'dash_moves' });

      expect(result.text).toMatch(/^Ran 1 test in 1 script with GUT \(res:\/\/test, \d+\.\d s\): all passed\.$/);
    },
    testRunTimeoutMs,
  );

  it(
    'names a test script that failed to load',
    async () => {
      project?.write('test/test_broken.gd', 'extends GutTest\n\n\nfunc test_nothing() -> void:\n\tassert_eq(SPED, 1)\n');

      const result = await sessionTools(session).call('test_run', { paths: ['res://test/test_broken.gd'] });

      expect(result.text).toContain('Test scripts that failed to load, so their tests did not run:\n- res://test/test_broken.gd:5: Parse Error:');
    },
    testRunTimeoutMs,
  );

  it(
    'runs tests of new classes while the editor is open',
    async () => {
      const launched = await sessionTools(session).call('editor_launch', { headless: true });
      project?.write('enemy.gd', 'class_name Enemy\nextends Node3D\n\nvar health := 3\n');
      project?.write('test/test_enemy.gd', 'extends GutTest\n\n\nfunc test_starts_with_three_health() -> void:\n\tassert_eq(autofree(Enemy.new()).health, 3)\n');

      const result = await sessionTools(session).call('test_run', { paths: ['res://test/test_enemy.gd'] });

      expect(launched.text).toMatch(/^Started the Godot editor/);
      expect(result.text).toMatch(/^Ran 1 test in 1 script with GUT \(res:\/\/test\/test_enemy\.gd, \d+\.\d s\): all passed\.$/);
    },
    editorStartupTimeoutMs + testRunTimeoutMs,
  );
});

describe.skipIf(godotBinary === '' || !gdUnitInstalled)('running gdUnit4 tests', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  beforeAll(async () => {
    project = new TemporaryProject('MCP gdUnit4 tests', { testFramework: 'gdUnit4' });
    mkdirSync(project.path('test/unit'), { recursive: true });
    project.write('player.gd', playerScript);
    project.write('test/unit/player_test.gd', gdUnitPlayerTests);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    project?.remove();
  });

  it(
    'runs the test suites and reports the failure with its line',
    async () => {
      const result = await sessionTools(session).call('test_run');

      expect(result.isError).toBe(false);
      expect(result.text).toMatch(/^Ran 2 tests in 1 script with gdUnit4 \(res:\/\/test, \d+\.\d s\): 1 passed, 1 failed\.\nFailed:\n/);
      expect(result.text).toContain('- test_dash_keeps_the_direction (res://test/unit/player_test.gd:13)');
    },
    testRunTimeoutMs,
  );

  it('refuses to pick tests by name', async () => {
    const result = await sessionTools(session).call('test_run', { name: 'dash' });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('gdUnit4 runs whole test suites');
  });
});
