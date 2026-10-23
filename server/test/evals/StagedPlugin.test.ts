import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stagePlugin } from './StagedPlugin.js';

const pluginDirectory = join(import.meta.dirname, '..', '..', '..', 'plugin');
const cliPath = '/checkout/server/dist/index.js';

describe('the plugin staged for evaluation runs', () => {
  let destination: string;

  beforeEach(() => {
    destination = join(mkdtempSync(join(tmpdir(), 'staged-plugin-')), 'godot');
  });

  afterEach(() => {
    rmSync(join(destination, '..'), { recursive: true, force: true });
  });

  it('keeps the manifest, the hook and the skill, and leaves the server to the run', () => {
    stagePlugin(pluginDirectory, destination, cliPath);

    expect(existsSync(join(destination, '.claude-plugin', 'plugin.json'))).toBe(true);
    expect(existsSync(join(destination, 'skills', 'godot', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(destination, '.mcp.json'))).toBe(false);
  });

  it('runs the hook with the local build instead of the published package', () => {
    stagePlugin(pluginDirectory, destination, cliPath);

    const hooks = JSON.parse(readFileSync(join(destination, 'hooks', 'hooks.json'), 'utf8')) as {
      readonly hooks: { readonly PostToolUse: readonly { readonly hooks: readonly { readonly command: string }[] }[] };
    };
    expect(hooks.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(`node "${cliPath}" check-edited-script`);
  });
});
