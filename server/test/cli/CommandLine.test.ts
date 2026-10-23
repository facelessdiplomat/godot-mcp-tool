import { describe, expect, it } from 'vitest';
import { parseCommandLine, usage } from '../../src/cli/CommandLine.js';

describe('the command line', () => {
  it('runs the MCP server without arguments, as Claude Code starts it', () => {
    expect(parseCommandLine([])).toEqual({ kind: 'serve' });
  });

  it('takes a command with an optional project folder', () => {
    expect(parseCommandLine(['install-addon'])).toEqual({ kind: 'install-addon', projectPath: undefined });
    expect(parseCommandLine(['update-addon', '../game'])).toEqual({ kind: 'update-addon', projectPath: '../game' });
    expect(parseCommandLine(['doctor', '/projects/game'])).toEqual({ kind: 'doctor', projectPath: '/projects/game' });
  });

  it('shows the help and the version', () => {
    expect(parseCommandLine(['--help'])).toEqual({ kind: 'help' });
    expect(parseCommandLine(['-h'])).toEqual({ kind: 'help' });
    expect(parseCommandLine(['help'])).toEqual({ kind: 'help' });
    expect(parseCommandLine(['doctor', '--help'])).toEqual({ kind: 'help' });
    expect(parseCommandLine(['--version'])).toEqual({ kind: 'version' });
    expect(parseCommandLine(['-v'])).toEqual({ kind: 'version' });
  });

  it('rejects an unknown command and extra arguments', () => {
    expect(parseCommandLine(['instal-addon'])).toEqual({ kind: 'invalid', reason: 'Unknown command "instal-addon".' });
    expect(parseCommandLine(['doctor', 'game', 'more'])).toEqual({ kind: 'invalid', reason: 'doctor takes one project folder, but got: game more.' });
    expect(parseCommandLine(['doctor', '--verbose'])).toEqual({ kind: 'invalid', reason: 'Unknown option "--verbose".' });
  });

  it('describes every command in the help', () => {
    expect(usage).toContain('Usage: godot-mcp-tool [command] [project folder]');
    for (const command of ['install-addon', 'update-addon', 'doctor']) {
      expect(usage).toContain(`  ${command} `);
    }
  });
});
