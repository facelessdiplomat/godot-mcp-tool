import { describe, expect, it } from 'vitest';
import { bbcodeToMarkdown, summarize } from '../../src/docs/BbcodeMarkdown.js';

describe('bbcodeToMarkdown', () => {
  it('turns references into code spans', () => {
    expect(bbcodeToMarkdown('Moves [CharacterBody3D] with [method move_and_slide] and [member velocity].')).toBe(
      'Moves `CharacterBody3D` with `move_and_slide()` and `velocity`.',
    );
    expect(bbcodeToMarkdown('See [method Node._physics_process], [signal body_entered], [constant MOTION_MODE_GROUNDED] and [param target].')).toBe(
      'See `Node._physics_process()`, `body_entered`, `MOTION_MODE_GROUNDED` and `target`.',
    );
    expect(bbcodeToMarkdown('Returns an [int], or [enum Error] with [annotation @export].')).toBe('Returns an `int`, or `Error` with `@export`.');
  });

  it('formats emphasis, keys and links', () => {
    expect(bbcodeToMarkdown('[b]Note:[/b] press [kbd]Ctrl + S[/kbd], [i]not[/i] [url=https://docs.godotengine.org]the docs[/url].')).toBe(
      '**Note:** press `Ctrl + S`, *not* [the docs](https://docs.godotengine.org).',
    );
    expect(bbcodeToMarkdown('Read [url]https://example.com[/url][br]then [lb]this[rb].')).toBe('Read <https://example.com>\nthen [this].');
  });

  it('keeps square brackets inside code as they are', () => {
    expect(bbcodeToMarkdown('Use [code]array[0] = [1, 2][/code] here.')).toBe('Use `array[0] = [1, 2]` here.');
  });

  it('keeps the GDScript version of a code example and drops the C# one', () => {
    const text = 'Example:\n[codeblocks]\n[gdscript]\nvar list = [1, 2]\nprint(list)\n[/gdscript]\n[csharp]\nvar list = new[] { 1, 2 };\n[/csharp]\n[/codeblocks]\nDone.';

    expect(bbcodeToMarkdown(text)).toBe('Example:\n```gdscript\nvar list = [1, 2]\nprint(list)\n```\nDone.');
  });

  it('fences a single code block in its language', () => {
    expect(bbcodeToMarkdown('[codeblock]\nfunc _ready():\n\tpass\n[/codeblock]')).toBe('```gdscript\nfunc _ready():\n\tpass\n```');
    expect(bbcodeToMarkdown('[codeblock lang=text]\nplain\n[/codeblock]')).toBe('```text\nplain\n```');
  });

  it('drops layout tags and images but keeps their text', () => {
    expect(bbcodeToMarkdown('[center][color=red]Warning[/color][/center] [img width=16]res://icon.png[/img]shown')).toBe('Warning shown');
  });

  it('leaves text that only looks like a tag alone', () => {
    expect(bbcodeToMarkdown('A range of [0, 1] and [lots of words].')).toBe('A range of [0, 1] and [lots of words].');
  });
});

describe('summarize', () => {
  it('keeps the first sentence', () => {
    expect(summarize('Moves the body based on `velocity`. If the body collides, it slides.')).toBe('Moves the body based on `velocity`.');
  });

  it('does not end a sentence inside a code span', () => {
    expect(summarize('Calls `node.queue_free()` later. Then frees it.')).toBe('Calls `node.queue_free()` later.');
  });

  it('keeps only the first line', () => {
    expect(summarize('First line without a period\nSecond line.')).toBe('First line without a period');
  });

  it('shortens a long sentence at a word', () => {
    expect(summarize('word '.repeat(40).trim() + '.', 30)).toBe('word word word word word word…');
  });

  it('gives an empty summary for an empty text', () => {
    expect(summarize('')).toBe('');
  });
});
