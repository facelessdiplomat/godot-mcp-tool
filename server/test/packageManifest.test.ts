import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: unknown;
  readonly bugs?: unknown;
}

const serverDirectory = join(import.meta.dirname, '..');
const repositoryRoot = join(serverDirectory, '..');
const repositoryUrl = 'https://github.com/facelessdiplomat/godot-mcp-tool';
const repositoryFilePattern = new RegExp(`^${repositoryUrl}/blob/master/(?<path>[^#]+)`);
const manifest = JSON.parse(readFileSync(join(serverDirectory, 'package.json'), 'utf8')) as PackageManifest;

describe('the npm package', () => {
  it('points to the repository, its issues and its documentation', () => {
    expect(manifest.repository).toEqual({ type: 'git', url: `git+${repositoryUrl}.git`, directory: 'server' });
    expect(manifest.homepage).toBe(`${repositoryUrl}#readme`);
    expect(manifest.bugs).toEqual({ url: `${repositoryUrl}/issues` });
    expect(manifest.license).toBe('MIT');
  });

  it('ships the license of the repository', () => {
    expect(readFileSync(join(serverDirectory, 'LICENSE'), 'utf8')).toBe(readFileSync(join(repositoryRoot, 'LICENSE'), 'utf8'));
  });

  it('has a README of its own whose links lead to existing pages of the repository from the npm page too', () => {
    const readme = readFileSync(join(serverDirectory, 'README.md'), 'utf8');
    const links = [...readme.matchAll(/\]\((?<target>[^)\s]+)\)/g)].map((match) => match.groups?.['target'] ?? '');

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(/^https:\/\//);
      const repositoryFile = repositoryFilePattern.exec(link)?.groups?.['path'];
      if (repositoryFile !== undefined) {
        expect(existsSync(join(repositoryRoot, repositoryFile)), link).toBe(true);
      }
    }
  });
});
