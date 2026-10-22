import { describe, expect, it } from 'vitest';
import { isLoadErrorOf } from '../../src/scripts/ScriptLoadErrors.js';

const isAboutPlayer = isLoadErrorOf(['res://prototype/player.gd', 'res://prototype/camera.gd']);

describe('isLoadErrorOf', () => {
  it('matches the errors the editor printed while loading one of the scripts', () => {
    expect(isAboutPlayer({ source: 'editor', message: 'Parse Error: Identifier "SPED" not declared in the current scope.', location: 'res://prototype/player.gd:15' })).toBe(true);
    expect(isAboutPlayer({ source: 'editor', message: 'Compile Error: Identifier not found: SPED', location: 'res://prototype/camera.gd:16' })).toBe(true);
    expect(
      isAboutPlayer({ source: 'editor', message: 'Failed to load script "res://prototype/player.gd" with error "Parse error".', location: 'modules/gdscript/gdscript_resource_format.cpp:50' }),
    ).toBe(true);
  });

  it('leaves out other scripts, runtime errors and errors of the game', () => {
    expect(isAboutPlayer({ source: 'editor', message: 'Parse Error: Unexpected "Indent".', location: 'res://prototype/player_input.gd:3' })).toBe(false);
    expect(isAboutPlayer({ source: 'editor', message: 'Failed to load script "res://prototype/player.gd.bak" with error "Parse error".' })).toBe(false);
    expect(isAboutPlayer({ source: 'editor', message: "Invalid access to property 'speed'.", location: 'res://prototype/player.gd:12' })).toBe(false);
    expect(isAboutPlayer({ source: 'game', message: 'Parse Error: Identifier "SPED" not declared in the current scope.', location: 'res://prototype/player.gd:15' })).toBe(false);
  });
});
