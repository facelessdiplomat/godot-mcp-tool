import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { RenameError, type RenameReport } from '../../src/scripts/ScriptRenamer.js';
import { ScriptRenameTool } from '../../src/tools/ScriptRenameTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const report: RenameReport = {
  symbol: 'take_damage',
  newName: 'apply_damage',
  kind: 'function',
  script: 'res://enemy.gd',
  scripts: [
    { resourcePath: 'res://enemy.gd', changes: { places: 1 } },
    { resourcePath: 'res://player.gd', changes: { places: 2 } },
  ],
  resources: [{ resourcePath: 'res://arena.tscn', changes: { connections: 2, method_keys: 1 } }],
  mentions: [{ resourcePath: 'res://ui.gd', line: 14, text: 'enemy.call("take_damage", 1)' }],
};

describe('script_rename_symbol', () => {
  it('reports the code, the scenes and the places left to check', async () => {
    const requests: unknown[] = [];
    const tool = new ScriptRenameTool({
      rename: (request) => {
        requests.push(request);
        return Promise.resolve(report);
      },
    });

    const result = await tool.execute({ path: 'res://enemy.gd', symbol: 'take_damage', new_name: 'apply_damage' });

    expect(requests).toEqual([{ path: 'res://enemy.gd', symbol: 'take_damage', newName: 'apply_damage' }]);
    expect(textOf(result)).toBe(
      [
        'Renamed the function take_damage of res://enemy.gd to apply_damage in 3 places of code: res://enemy.gd (1), res://player.gd (2).',
        'In scenes and resources: res://arena.tscn: 2 signal connections, 1 method track key.',
        'The editor reloaded the changed files.',
        'Still named take_damage — in strings, comments, other classes, or calls the language server could not trace; check each:',
        '- res://ui.gd:14: enemy.call("take_damage", 1)',
      ].join('\n'),
    );
  });

  it('explains what it cannot rename', async () => {
    const tool = new ScriptRenameTool({ rename: () => Promise.reject(new RenameError('res://enemy.gd declares no take_damag.')) });

    const result = await tool.execute({ path: 'res://enemy.gd', symbol: 'take_damag', new_name: 'apply_damage' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('res://enemy.gd declares no take_damag.');
  });
});
