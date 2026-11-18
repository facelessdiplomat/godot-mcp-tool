import { describe, expect, it } from 'vitest';
import { findDeclaration } from '../../src/scripts/SymbolDeclaration.js';

const enemy = [
  'class_name Enemy',
  'extends CharacterBody3D',
  '',
  'signal died(by: Node)',
  '',
  '@export_range(0, 10) var health := 5',
  'const SPEED := 2.0',
  'enum Mood { CALM, ANGRY }',
  '',
  '',
  'static func spawn() -> Enemy:',
  '\treturn null',
  '',
  '',
  'func take_damage(amount: int) -> void:',
  '\thealth -= amount',
  '',
].join('\n');

describe('finding where a symbol is declared', () => {
  it('finds functions, signals, variables, constants, enums and the class name with their places', () => {
    expect(findDeclaration(enemy, 'take_damage')).toEqual({ line: 14, character: 5, kind: 'function' });
    expect(findDeclaration(enemy, 'spawn')).toEqual({ line: 10, character: 12, kind: 'function' });
    expect(findDeclaration(enemy, 'died')).toEqual({ line: 3, character: 7, kind: 'signal' });
    expect(findDeclaration(enemy, 'health')).toEqual({ line: 5, character: 25, kind: 'variable' });
    expect(findDeclaration(enemy, 'SPEED')).toEqual({ line: 6, character: 6, kind: 'constant' });
    expect(findDeclaration(enemy, 'Mood')).toEqual({ line: 7, character: 5, kind: 'enum' });
    expect(findDeclaration(enemy, 'Enemy')).toEqual({ line: 0, character: 11, kind: 'class' });
  });

  it('finds nothing for a name the script only uses', () => {
    expect(findDeclaration(enemy, 'amount')).toBeUndefined();
    expect(findDeclaration(enemy, 'take')).toBeUndefined();
  });
});
