import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { ExportError } from '../../src/export/ExportError.js';
import type { ExportRequest, ExportResult } from '../../src/export/ProjectExporter.js';
import { type ExportService, ExportProjectTool } from '../../src/tools/ExportProjectTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

class FakeExporter implements ExportService {
  readonly requests: ExportRequest[] = [];

  constructor(private readonly outcome: ExportResult | ExportError) {}

  export(request: ExportRequest): Promise<ExportResult> {
    this.requests.push(request);
    return this.outcome instanceof ExportError ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
  }
}

const macosExport: ExportResult = {
  preset: { name: 'macOS', platform: 'macOS', exportPath: 'build/macos/game.zip' },
  mode: 'release',
  output: 'build/macos/game.zip',
  files: [{ name: 'game.zip', bytes: 31_457_280 }],
  warnings: [],
  unsavedFiles: [],
  ignoredFolder: undefined,
  durationMs: 4230,
};

describe('ExportProjectTool', () => {
  it('reports the written files with their sizes', async () => {
    const exporter = new FakeExporter(macosExport);

    const result = await new ExportProjectTool(exporter).execute({});

    expect(exporter.requests).toEqual([{ mode: 'release', timeoutMs: 600_000 }]);
    expect(textOf(result)).toBe(['Exported the preset "macOS" (macOS, release) to build/macos/game.zip in 4.2 s:', '- game.zip (30.0 MB)'].join('\n'));
  });

  it('adds the warnings, the new .gdignore file and the unsaved changes that the build misses', async () => {
    const exporter = new FakeExporter({
      ...macosExport,
      preset: { name: 'Linux', platform: 'Linux', exportPath: 'build/linux/game.x86_64' },
      mode: 'debug',
      output: 'build/linux/game.x86_64',
      files: [
        { name: 'game.pck', bytes: 812 },
        { name: 'game.x86_64', bytes: 2048 },
      ],
      warnings: ['Code Signing: Code signing is disabled.'],
      unsavedFiles: ['res://level.tscn', 'res://player.gd'],
      ignoredFolder: 'build',
    });

    const result = await new ExportProjectTool(exporter).execute({ preset: 'Linux', mode: 'debug', output: 'build/linux/game.x86_64', timeout_ms: 120_000 });

    expect(exporter.requests).toEqual([{ preset: 'Linux', mode: 'debug', output: 'build/linux/game.x86_64', timeoutMs: 120_000 }]);
    expect(textOf(result)).toBe(
      [
        'Exported the preset "Linux" (Linux, debug) to build/linux/game.x86_64 in 4.2 s:',
        '- game.pck (812 B)',
        '- game.x86_64 (2.0 KB)',
        'Warnings:',
        '- Code Signing: Code signing is disabled.',
        'Added a .gdignore file to build/, so the editor does not import the exported files.',
        'Not in this build: unsaved changes in the editor to res://level.tscn, res://player.gd. Save them (scene_save saves scenes) and export again.',
      ].join('\n'),
    );
  });

  it('returns the reason when the export fails', async () => {
    const result = await new ExportProjectTool(new FakeExporter(new ExportError('There is no export preset "Linux" in this project.'))).execute({ preset: 'Linux' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('There is no export preset "Linux" in this project.');
  });
});
