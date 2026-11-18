import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import { ExportPresetWriter } from '../../src/export/ExportPresetWriter.js';
import { ExportPresetAddTool } from '../../src/tools/ExportPresetAddTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function editorThat(connected: boolean): { status: () => Promise<EditorStatus> } {
  return { status: () => Promise.resolve(connected ? ({ connected: true, hello: {} } as unknown as EditorStatus) : { connected: false, reason: 'No editor runs.' }) };
}

describe('export_preset_add', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'export-preset-add-')));
    writeFileSync(join(projectRoot, 'project.godot'), ['config_version=5', '', '[application]', '', 'config/name="Capsule Walk"', ''].join('\n'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('adds a preset named after the platform with an export path named after the game', async () => {
    const result = await new ExportPresetAddTool(new ExportPresetWriter(projectRoot, editorThat(false))).execute({ platform: 'Linux' });

    expect(textOf(result)).toBe(
      'Added the export preset "Linux" (Linux) to export_presets.cfg, exporting to build/linux/capsule-walk.x86_64. Export with export_project; its mode "pack" needs no export templates.',
    );
    expect(readFileSync(join(projectRoot, 'export_presets.cfg'), 'utf8')).toContain('export_path="build/linux/capsule-walk.x86_64"');
  });

  it('warns that a running editor shows the preset only after a restart', async () => {
    const result = await new ExportPresetAddTool(new ExportPresetWriter(projectRoot, editorThat(true))).execute({ platform: 'Web' });

    expect(textOf(result)).toContain('exporting to build/web/index.html');
    expect(textOf(result)).toContain('after a restart');
  });

  it('refuses a name that a preset has already', async () => {
    const tool = new ExportPresetAddTool(new ExportPresetWriter(projectRoot, editorThat(false)));
    await tool.execute({ platform: 'Linux' });

    const again = await tool.execute({ platform: 'Linux' });

    expect(again.isError).toBe(true);
    expect(textOf(again)).toBe('A preset named "Linux" exists already; give another name.');
  });
});
