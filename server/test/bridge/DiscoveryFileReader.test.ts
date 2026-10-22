import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryFileReader } from '../../src/bridge/DiscoveryFileReader.js';

const validDiscovery = {
  protocol: 1,
  port: 50731,
  token: 'c2VjcmV0',
  pid: 41234,
  godot_version: '4.8.beta.custom_build.679066724',
  addon_version: '0.1.0',
  project_path: '/projects/game',
  executable_path: '/opt/godot/godot',
  lsp_port: 6005,
  started_at: '2026-10-21T18:00:00Z',
};

describe('DiscoveryFileReader', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'discovery-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeDiscovery(content: string): void {
    const reader = new DiscoveryFileReader(projectRoot, () => true);
    mkdirSync(dirname(reader.path), { recursive: true });
    writeFileSync(reader.path, content);
  }

  it('stores the file inside the project .godot folder', () => {
    expect(new DiscoveryFileReader(projectRoot, () => true).path).toBe(
      join(projectRoot, '.godot', 'godot_mcp_tool', 'bridge.json'),
    );
  });

  it('reports a missing file', () => {
    expect(new DiscoveryFileReader(projectRoot, () => true).read().kind).toBe('missing');
  });

  it('reads the endpoint of a running editor', () => {
    writeDiscovery(JSON.stringify(validDiscovery));

    const result = new DiscoveryFileReader(projectRoot, (pid) => pid === 41234).read();

    expect(result).toEqual({
      kind: 'found',
      endpoint: {
        protocol: 1,
        port: 50731,
        token: 'c2VjcmV0',
        pid: 41234,
        godotVersion: '4.8.beta.custom_build.679066724',
        addonVersion: '0.1.0',
        projectPath: '/projects/game',
        executablePath: '/opt/godot/godot',
        lspPort: 6005,
        startedAt: '2026-10-21T18:00:00Z',
      },
    });
  });

  it('reports a file left behind by an editor that is no longer running', () => {
    writeDiscovery(JSON.stringify(validDiscovery));

    const result = new DiscoveryFileReader(projectRoot, () => false).read();

    expect(result).toMatchObject({ kind: 'stale', pid: 41234, executablePath: '/opt/godot/godot' });
  });

  it('names the executable of the editor that last opened the project, running or not', () => {
    expect(new DiscoveryFileReader(projectRoot, () => false).lastEditorExecutable()).toBeUndefined();

    writeDiscovery(JSON.stringify(validDiscovery));

    expect(new DiscoveryFileReader(projectRoot, () => false).lastEditorExecutable()).toBe('/opt/godot/godot');
    expect(new DiscoveryFileReader(projectRoot, () => true).lastEditorExecutable()).toBe('/opt/godot/godot');
  });

  it('reports a file that is not JSON', () => {
    writeDiscovery('{not json');

    expect(new DiscoveryFileReader(projectRoot, () => true).read().kind).toBe('invalid');
  });

  it('reports a file with missing fields', () => {
    writeDiscovery(JSON.stringify({ protocol: 1 }));

    const result = new DiscoveryFileReader(projectRoot, () => true).read();

    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.reason).toContain('port');
  });
});
