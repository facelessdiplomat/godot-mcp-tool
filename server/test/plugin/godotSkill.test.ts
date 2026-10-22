import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registeredToolNames } from '../support/registeredToolNames.js';

const skillFolder = new URL('../../../plugin/skills/godot/', import.meta.url);
const skillFiles = readdirSync(skillFolder).filter((fileName) => fileName.endsWith('.md'));
const supportingFiles = skillFiles.filter((fileName) => fileName !== 'SKILL.md');

function readSkillFile(fileName: string): string {
  return readFileSync(new URL(fileName, skillFolder), 'utf8');
}

function frontmatterOf(text: string): Map<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return new Map(
    block.split('\n').map((line) => {
      const separator = line.indexOf(':');
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
}

function linkedFiles(text: string): string[] {
  const targets = [...text.matchAll(/\]\(([^)]+)\)/g)].map((link) => link[1] ?? '');
  return [...new Set(targets.filter((target) => !/^[a-z]+:/.test(target)))].sort();
}

function codeBlocksOf(text: string): string[] {
  return [...text.matchAll(/^ *```[a-z]*\n([\s\S]*?)^ *```$/gm)].map((block) => block[1] ?? '');
}

function gdscriptBlocksOf(text: string): string[] {
  return [...text.matchAll(/^ *```gdscript\n([\s\S]*?)^ *```$/gm)].map((block) => block[1] ?? '');
}

function proseOf(text: string): string {
  return codeBlocksOf(text).reduce((prose, block) => prose.replace(block, ''), text);
}

function mentionedToolNames(text: string, toolFamilies: ReadonlySet<string>): string[] {
  const snakeCaseWords = proseOf(text).match(/(?<![\w/.])[a-z]+(?:_[a-z0-9]+)+/g) ?? [];
  return snakeCaseWords.filter((word) => toolFamilies.has(word.split('_')[0] ?? ''));
}

describe('the godot skill', () => {
  it('has the name and description that Claude Code lists', () => {
    const frontmatter = frontmatterOf(readSkillFile('SKILL.md'));

    expect(frontmatter.get('name')).toBe('godot');
    expect(frontmatter.get('description')?.length).toBeGreaterThan(80);
    expect(frontmatter.get('description')?.length).toBeLessThanOrEqual(1024);
  });

  it('keeps SKILL.md short and links every supporting file from it', () => {
    const skill = readSkillFile('SKILL.md');

    expect(skill.split('\n').length).toBeLessThan(500);
    expect(supportingFiles.length).toBeGreaterThan(0);
    expect(linkedFiles(skill)).toEqual([...supportingFiles].sort());
  });

  it('names only tools that exist', async () => {
    const toolNames = await registeredToolNames();
    const toolFamilies = new Set(toolNames.map((toolName) => toolName.split('_')[0] ?? ''));
    const mentionedTools = skillFiles.flatMap((fileName) => mentionedToolNames(readSkillFile(fileName), toolFamilies));

    expect(mentionedTools.length).toBeGreaterThan(20);
    expect(mentionedTools.filter((toolName) => !toolNames.includes(toolName))).toEqual([]);
  });

  it('indents its GDScript samples with tabs, as Godot does', () => {
    const indentedWithSpaces = skillFiles.flatMap((fileName) =>
      gdscriptBlocksOf(readSkillFile(fileName))
        .flatMap((block) => block.split('\n'))
        .filter((line) => /^\t* /.test(line))
        .map((line) => `${fileName}: ${line}`),
    );

    expect(indentedWithSpaces).toEqual([]);
  });
});
