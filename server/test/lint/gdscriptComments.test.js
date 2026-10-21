import { describe, expect, it } from 'vitest';
import { findGdscriptComments } from '../../tools/gdscriptComments.js';

describe('findGdscriptComments', () => {
  it('accepts code without comments', () => {
    expect(findGdscriptComments('extends Node\n\nvar speed := 5\n')).toEqual([]);
  });

  it('finds a full-line comment', () => {
    expect(findGdscriptComments('# explains the code\nvar speed := 5\n')).toEqual([{ line: 1, column: 1 }]);
  });

  it('finds a comment after code', () => {
    expect(findGdscriptComments('var speed := 5 # tuned\n')).toEqual([{ line: 1, column: 16 }]);
  });

  it('finds documentation comments and regions', () => {
    expect(findGdscriptComments('## Docs\n#region Movement\nvar speed := 5\n#endregion\n')).toEqual([
      { line: 1, column: 1 },
      { line: 2, column: 1 },
      { line: 4, column: 1 },
    ]);
  });

  it('ignores a hash inside double and single quoted strings', () => {
    expect(findGdscriptComments('var color := "#ff8800"\nvar mark := \'#\'\n')).toEqual([]);
  });

  it('ignores a hash after an escaped quote', () => {
    expect(findGdscriptComments('var text := "say \\"#hi\\""\n')).toEqual([]);
  });

  it('ignores a hash inside a multi-line string', () => {
    expect(findGdscriptComments('var text := """first\n# not a comment\n"""\nvar other := 1\n')).toEqual([]);
  });

  it('ignores a hash inside raw, StringName and NodePath strings', () => {
    expect(findGdscriptComments('var path := r"C:\\#1"\nvar tag := &"#tag"\nvar node := ^"a#b"\n')).toEqual([]);
  });

  it('keeps counting lines after strings', () => {
    expect(findGdscriptComments('var a := "x"\nvar b := """\n"""\n# late\n')).toEqual([{ line: 4, column: 1 }]);
  });
});
