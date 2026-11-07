import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const addonDirectory = join(import.meta.dirname, '..', '..', '..', 'addon', 'addons', 'godot_mcp_tool');
const memberPrefix = 'GodotMcp';
const memberDeclaration = /^\s*(?:static\s+)?(?:const|var|enum|class|signal|func)\s+(?<name>[A-Za-z_]\w*)/;

function addonScripts(): string[] {
  return readdirSync(addonDirectory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.gd'))
    .map((entry) => join(addonDirectory, entry));
}

function couldBeTheNameOfAClass(name: string): boolean {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name);
}

function membersThatCouldShadowAGameClass(): string[] {
  return addonScripts().flatMap((script) =>
    readFileSync(script, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const name = memberDeclaration.exec(line)?.groups?.['name'];
        return name !== undefined && couldBeTheNameOfAClass(name) && !name.startsWith(memberPrefix) ? [`${relative(addonDirectory, script)}:${String(index + 1)} ${name}`] : [];
      }),
  );
}

describe('the names of the addon members', () => {
  it('start with GodotMcp when they could be the name of a class, so they never shadow a native class of the game', () => {
    expect(membersThatCouldShadowAGameClass()).toEqual([]);
  });
});
