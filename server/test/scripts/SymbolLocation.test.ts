import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locateSymbol, occurrencesOf, SymbolLookupError } from '../../src/scripts/SymbolLocation.js';

describe('symbol location', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'symbol-location-')));
    writeFileSync(join(root, 'project.godot'), 'config_version=5\n');
    writeFileSync(join(root, 'enemy.gd'), 'extends Node\n\nsignal died\n\n\nfunc take_damage(amount: int) -> void:\n\tvar take_damage_count := amount\n\ttake_damage(take_damage_count - 1)  # take_damage again\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the script and the declaration of a symbol', () => {
    const located = locateSymbol(root, 'res://enemy.gd', 'died');

    expect(located.script.resourcePath).toBe('res://enemy.gd');
    expect(located.declaration).toEqual({ line: 2, character: 7, kind: 'signal' });
  });

  it('says which script to pass when the one given does not declare the symbol', () => {
    expect(() => locateSymbol(root, 'res://enemy.gd', 'heal')).toThrow(
      new SymbolLookupError('res://enemy.gd declares no heal; pass the script that declares it, such as the one with "func heal(".'),
    );
  });

  it('finds every occurrence of the whole word, with its place counted from zero', () => {
    const { script } = locateSymbol(root, 'res://enemy.gd', 'take_damage');

    expect(occurrencesOf([script], 'take_damage')).toEqual([
      { resourcePath: 'res://enemy.gd', line: 5, character: 5, text: 'func take_damage(amount: int) -> void:' },
      { resourcePath: 'res://enemy.gd', line: 7, character: 1, text: 'take_damage(take_damage_count - 1)  # take_damage again' },
      { resourcePath: 'res://enemy.gd', line: 7, character: 39, text: 'take_damage(take_damage_count - 1)  # take_damage again' },
    ]);
  });
});
