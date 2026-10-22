import { describe, expect, it } from 'vitest';
import { similarNames, similarNamesHint } from '../../src/util/SimilarNames.js';

describe('similarNames', () => {
  it('suggests names that share most letter pairs', () => {
    expect(similarNames('positon', ['position', 'rotation', 'scale'])).toEqual(['position']);
  });

  it('suggests short names one edit away', () => {
    expect(similarNames('jmp', ['jump', 'move_forward', 'ui_accept'])).toEqual(['jump']);
  });

  it('ignores unrelated names', () => {
    expect(similarNames('jmp', ['move_forward', 'ui_accept', 'crouch'])).toEqual([]);
  });

  it('puts the closest names first and ignores case', () => {
    expect(similarNames('CHARACTERBODY', ['Character', 'CharacterBody3D', 'CharacterBody2D'])[0]).toBe('CharacterBody3D');
  });

  it('writes a hint only when something is similar', () => {
    expect(similarNamesHint('jmp', ['jump'])).toBe('Similar: jump.');
    expect(similarNamesHint('jmp', ['crouch'])).toBe('');
  });
});
