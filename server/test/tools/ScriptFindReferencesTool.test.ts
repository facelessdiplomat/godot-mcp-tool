import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { ReferenceSearchError, type ReferenceReport } from '../../src/scripts/ScriptReferenceFinder.js';
import { SymbolLookupError } from '../../src/scripts/SymbolLocation.js';
import { ScriptFindReferencesTool } from '../../src/tools/ScriptFindReferencesTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const report: ReferenceReport = {
  symbol: 'take_damage',
  kind: 'function',
  script: 'res://enemy.gd',
  declaration: { resourcePath: 'res://enemy.gd', line: 9, text: 'func take_damage(amount: int = 1) -> void:' },
  code: [
    { resourcePath: 'res://enemy.gd', line: 14, text: 'take_damage(2)' },
    { resourcePath: 'res://player.gd', line: 8, text: 'target.take_damage(1)' },
  ],
  resources: [
    {
      resourcePath: 'res://arena.tscn',
      uses: [
        { line: 10, kind: 'method_keys', count: 2, node: '', text: 'tracks/0/keys = {"values": [{"args": [3], "method": &"take_damage"}]}' },
        { line: 29, kind: 'connections', count: 1, node: 'Goblin', text: '[connection signal="body_entered" from="Spikes" to="Goblin" method="take_damage"]' },
      ],
    },
  ],
  mentions: [{ resourcePath: 'res://player.gd', line: 10, text: 'if target.has_method("take_damage"):' }],
  unsavedFiles: [],
};

function toolAnswering(answer: ReferenceReport | Error): { tool: ScriptFindReferencesTool; requests: unknown[] } {
  const requests: unknown[] = [];
  const tool = new ScriptFindReferencesTool({
    find: (request) => {
      requests.push(request);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  });
  return { tool, requests };
}

describe('script_find_references', () => {
  it('lists the declaration, the uses in code and in scenes, and the mentions to check', async () => {
    const { tool, requests } = toolAnswering(report);

    const result = await tool.execute({ path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(requests).toEqual([{ path: 'res://enemy.gd', symbol: 'take_damage' }]);
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(
      [
        'take_damage is a function of res://enemy.gd, declared at res://enemy.gd:9: func take_damage(amount: int = 1) -> void:',
        'Used in code, as the language server traces it (2 places):',
        '- res://enemy.gd:14: take_damage(2)',
        '- res://player.gd:8: target.take_damage(1)',
        'Used in scenes and resources, which the language server does not see (3 places):',
        '- res://arena.tscn:10: 2 method track keys: tracks/0/keys = {"values": [{"args": [3], "method": &"take_damage"}]}',
        '- res://arena.tscn:29: a signal connection to Goblin: [connection signal="body_entered" from="Spikes" to="Goblin" method="take_damage"]',
        'Named take_damage where the language server could not trace it — calls on untyped variables, strings such as call("take_damage"), comments, or another class with its own take_damage; check each:',
        '- res://player.gd:10: if target.has_method("take_damage"):',
      ].join('\n'),
    );
  });

  it('says when nothing uses the symbol, and which files it read from disk because they have unsaved changes', async () => {
    const { tool } = toolAnswering({ ...report, kind: 'signal', symbol: 'died', code: [], resources: [], mentions: [], unsavedFiles: ['res://arena.tscn'] });

    const text = textOf(await tool.execute({ path: 'res://enemy.gd', symbol: 'died' }));

    expect(text).toContain('No use in code that the language server could trace.');
    expect(text).toContain('No signal connection, method track key, saved value or animated property in scenes and resources.');
    expect(text).toContain('Files were read as saved on disk; these have unsaved changes in the editor: res://arena.tscn.');
  });

  it('names a signal connection from the node that emits a signal, and saved values and animated properties of a variable', async () => {
    const { tool } = toolAnswering({
      ...report,
      kind: 'variable',
      symbol: 'health',
      code: [],
      mentions: [],
      resources: [
        {
          resourcePath: 'res://arena.tscn',
          uses: [
            { line: 12, kind: 'animated_paths', count: 1, node: 'Goblin', text: 'tracks/1/path = NodePath("Goblin:health")' },
            { line: 18, kind: 'properties', count: 1, node: 'Goblin', text: 'health = 5' },
          ],
        },
      ],
    });

    const text = textOf(await tool.execute({ path: 'res://enemy.gd', symbol: 'health' }));

    expect(text).toContain('- res://arena.tscn:12: an animated property of Goblin: tracks/1/path = NodePath("Goblin:health")');
    expect(text).toContain('- res://arena.tscn:18: a saved value of Goblin: health = 5');
  });

  it('leaves out the scenes for a constant, an enum or a class, which scenes do not name', async () => {
    const { tool } = toolAnswering({ ...report, kind: 'constant', symbol: 'MAX_HEALTH', resources: [], mentions: [] });

    expect(textOf(await tool.execute({ path: 'res://enemy.gd', symbol: 'MAX_HEALTH' }))).not.toContain('scenes and resources');
  });

  it('keeps long lists short', async () => {
    const many = Array.from({ length: 130 }, (_, index) => ({ resourcePath: 'res://player.gd', line: index + 1, text: 'target.take_damage(1)' }));
    const { tool } = toolAnswering({ ...report, code: many, mentions: many.slice(0, 25) });

    const text = textOf(await tool.execute({ path: 'res://enemy.gd', symbol: 'take_damage' }));

    expect(text).toContain('Used in code, as the language server traces it (130 places):');
    expect(text).toContain('- … and 30 more places in code');
    expect(text).toContain('- … and 5 more');
  });

  it('explains what it cannot search', async () => {
    const lookup = toolAnswering(new SymbolLookupError('res://enemy.gd declares no take_damag.'));
    const search = toolAnswering(new ReferenceSearchError('Finding references needs the language server of the Godot editor.'));

    const notDeclared = await lookup.tool.execute({ path: 'res://enemy.gd', symbol: 'take_damag' });
    const noEditor = await search.tool.execute({ path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(notDeclared.isError).toBe(true);
    expect(textOf(notDeclared)).toBe('res://enemy.gd declares no take_damag.');
    expect(textOf(noEditor)).toBe('Finding references needs the language server of the Godot editor.');
  });
});
