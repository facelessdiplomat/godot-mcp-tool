import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = join(import.meta.dirname, '..', '..', '..');
const addonFolder = join(repositoryRoot, 'addon', 'addons', 'godot_mcp_tool');
const repositoryFilePattern = /^https:\/\/github\.com\/facelessdiplomat\/godot-mcp-tool\/blob\/master\/(?<path>[^#]+)/;

describe('the addon folder that users keep in their projects', () => {
  it('holds the license of the repository', () => {
    expect(readFileSync(join(addonFolder, 'LICENSE'), 'utf8')).toBe(readFileSync(join(repositoryRoot, 'LICENSE'), 'utf8'));
  });

  it('holds a README that names the server it needs and links to existing pages of the repository', () => {
    const readme = readFileSync(join(addonFolder, 'README.md'), 'utf8');
    const links = [...readme.matchAll(/\]\((?<target>[^)\s]+)\)/g)].map((match) => match.groups?.['target'] ?? '');

    expect(readme).toContain('npx godot-mcp-tool update-addon');
    expect(links).toContain('https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/setup.md');
    for (const link of links) {
      expect(link).toMatch(/^https:\/\//);
      const repositoryFile = repositoryFilePattern.exec(link)?.groups?.['path'];
      if (repositoryFile !== undefined) {
        expect(existsSync(join(repositoryRoot, repositoryFile)), link).toBe(true);
      }
    }
  });
});
