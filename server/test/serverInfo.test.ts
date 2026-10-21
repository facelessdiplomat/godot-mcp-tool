import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVER_NAME, SERVER_VERSION } from '../src/serverInfo.js';

describe('serverInfo', () => {
  it('matches package.json', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
    };

    expect(SERVER_NAME).toBe(packageJson.name);
    expect(SERVER_VERSION).toBe(packageJson.version);
  });
});
