import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCommandLine, usage } from '../../src/cli/CommandLine.js';
import { runCommand } from '../../src/cli/runCommand.js';
import { SERVER_VERSION } from '../../src/serverInfo.js';

describe('running a command of the command line', () => {
  let workspace: string;
  let bundleDirectory: string;
  let projectRoot: string;
  let output: string[];
  let errors: string[];
  let hookInput: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'run-command-'));
    bundleDirectory = join(workspace, 'package', 'addon', 'godot_mcp_tool');
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(join(bundleDirectory, 'plugin.cfg'), ['[plugin]', '', `version="${SERVER_VERSION}"`, ''].join('\n'));
    projectRoot = join(workspace, 'game');
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, 'project.godot'), ['config_version=5', ''].join('\n'));
    output = [];
    errors = [];
    hookInput = '';
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  async function run(commandLineArguments: readonly string[], workingDirectory = projectRoot): Promise<number> {
    const request = parseCommandLine(commandLineArguments);
    if (request.kind === 'serve') {
      throw new Error('Expected a command');
    }
    return runCommand(
      request,
      {
        variables: {},
        workingDirectory,
        platform: process.platform,
        homeDirectory: workspace,
        nodeVersion: '22.12.0',
        bundledAddonDirectory: bundleDirectory,
        readInput: () => Promise.resolve(hookInput),
      },
      { write: (line) => output.push(line), writeError: (line) => errors.push(line) },
    );
  }

  it('installs the addon into the project of the working directory', async () => {
    expect(await run(['install-addon'])).toBe(0);
    expect(output[0]).toBe(`Installed the Godot MCP Tool addon ${SERVER_VERSION} in ${join(projectRoot, 'addons', 'godot_mcp_tool')}.`);
  });

  it('works on the project folder given after the command', async () => {
    expect(await run(['update-addon', 'game'], workspace)).toBe(1);
    expect(output).toEqual([`The addon is not installed in ${projectRoot}. Install it with: npx godot-mcp-tool install-addon`]);
  });

  it('checks the setup and finds the installed addon', async () => {
    await run(['install-addon']);
    output = [];

    await run(['doctor']);

    expect(output[0]).toBe(`Checking the setup of Godot MCP Tool ${SERVER_VERSION}:`);
    expect(output).toContain(`ok       Addon ${SERVER_VERSION} in ${join(projectRoot, 'addons', 'godot_mcp_tool')}`);
    expect(output).toContain(`ok       Plugin enabled in ${join(projectRoot, 'project.godot')}`);
  });

  it('says when it finds no project', async () => {
    mkdirSync(join(workspace, 'empty'));

    expect(await run(['install-addon', 'empty'], workspace)).toBe(1);
    expect(output).toEqual([`${join(workspace, 'empty')} has no project.godot.`]);
  });

  it('says when the package lacks its addon', async () => {
    rmSync(bundleDirectory, { recursive: true });

    expect(await run(['install-addon'])).toBe(1);
    expect(output).toEqual([`This package has no addon in ${bundleDirectory}. Build it with: npm run build`]);
  });

  it('lets the hook pass edits of files that are not scripts in silence', async () => {
    hookInput = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(projectRoot, 'notes.md'), content: '# Notes' } });

    expect(await run(['check-edited-script'])).toBe(0);
    expect([...output, ...errors]).toEqual([]);
  });

  it('lets the hook pass input that is not JSON in silence', async () => {
    hookInput = 'not json';

    expect(await run(['check-edited-script'])).toBe(0);
    expect([...output, ...errors]).toEqual([]);
  });

  it('shows the help, the version and the usage after a wrong command', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(output).toEqual(usage.split('\n'));

    output = [];
    expect(await run(['--version'])).toBe(0);
    expect(output).toEqual([`godot-mcp-tool ${SERVER_VERSION}`]);

    expect(await run(['instal-addon'])).toBe(2);
    expect(errors).toEqual(['Unknown command "instal-addon".', '', ...usage.split('\n')]);
  });
});
