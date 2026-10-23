import { describe, expect, it } from 'vitest';
import type { HelloResult } from '../../src/bridge/BridgeClient.js';
import type { EditorStatus, EditorStatusProvider } from '../../src/bridge/EditorConnection.js';
import type { BinaryLookup } from '../../src/godot/GodotBinaryLocator.js';
import { GodotVersion } from '../../src/godot/GodotVersion.js';
import type { ProjectLookup } from '../../src/project/ProjectLocator.js';
import { SERVER_VERSION } from '../../src/serverInfo.js';
import { GodotStatusTool } from '../../src/tools/GodotStatusTool.js';

const hello: HelloResult = {
  protocol: 1,
  godotVersion: '4.8.beta.custom_build.679066724',
  addonVersion: '0.1.0',
  projectPath: '/projects/game',
  executablePath: '/opt/godot/godot',
  methods: ['hello', 'ping'],
};

const foundProject: ProjectLookup = { found: true, root: '/projects/game', source: 'GODOT_PROJECT_PATH' };

function editorReporting(status: EditorStatus): EditorStatusProvider {
  return { status: () => Promise.resolve(status) };
}

const binaryFromRunningEditor = {
  locate: (runningEditorExecutable?: string): BinaryLookup =>
    runningEditorExecutable === undefined
      ? { found: false, reason: 'Set GODOT_BIN to the Godot executable.' }
      : { found: true, path: runningEditorExecutable, source: 'running editor' },
};

const readKnownVersion = (): Promise<GodotVersion> => Promise.resolve(GodotVersion.parse('4.8.beta.custom_build.679066724'));

async function statusText(tool: GodotStatusTool): Promise<string> {
  const result = await tool.execute({});
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('GodotStatusTool', () => {
  it('reports the project, the connected editor and the binary', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: true, hello }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    const text = await statusText(tool);

    expect(text).toContain('Project: /projects/game (from GODOT_PROJECT_PATH)');
    expect(text).toContain('Editor: connected. Godot 4.8.beta.custom_build.679066724, addon 0.1.0, bridge protocol 1');
    expect(text).toContain('Godot binary: /opt/godot/godot (from running editor), version 4.8.beta.custom_build.679066724');
  });

  it('says how to update an addon whose version differs from the server', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: true, hello: { ...hello, addonVersion: '0.0.1' } }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    const text = await statusText(tool);

    expect(text).toContain(
      `Editor: connected. Godot 4.8.beta.custom_build.679066724, addon 0.0.1, bridge protocol 1. The addon is not the version of this server (${SERVER_VERSION}): close the editor, run npx godot-mcp-tool update-addon in the project folder and open the editor again.`,
    );
  });

  it('lists the tool modes that are not the defaults', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: true, hello }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
      toolNotes: ['Read-only mode (GODOT_MCP_READ_ONLY): the tools that change the project or the game are left out.'],
    });

    const text = await statusText(tool);

    expect(text.split('\n').at(-1)).toBe('Read-only mode (GODOT_MCP_READ_ONLY): the tools that change the project or the game are left out.');
  });

  it('explains why the editor is not connected', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: false, reason: 'The editor is not running.' }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    expect(await statusText(tool)).toContain('Editor: not connected. The editor is not running. Start it with editor_launch.');
  });

  it('reports a missing binary with a hint', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: false, reason: 'The editor is not running.' }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    expect(await statusText(tool)).toContain('Godot binary: not found. Set GODOT_BIN to the Godot executable.');
  });

  it('reports a binary whose version cannot be read', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: true, hello }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: () => Promise.reject(new Error('permission denied')),
    });

    expect(await statusText(tool)).toContain('Godot binary: /opt/godot/godot (from running editor), version unknown: permission denied');
  });

  it('warns about a Godot binary older than the addon needs', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: false, reason: 'The Godot editor is not running for this project.' }),
      binaryLocator: { locate: () => ({ found: true, path: '/opt/godot-4.6/godot', source: 'GODOT_BIN' }) },
      readVersion: () => Promise.resolve(GodotVersion.parse('4.6.2.stable.official.71f334935')),
    });

    expect(await statusText(tool)).toContain(
      'Godot binary: /opt/godot-4.6/godot (from GODOT_BIN), version 4.6.2.stable.official.71f334935, older than 4.7, which Godot MCP Tool needs: set GODOT_BIN to Godot 4.7 or newer.',
    );
  });

  it('reports a missing project', async () => {
    const tool = new GodotStatusTool({
      project: { found: false, reason: 'No project.godot was found.' },
      editor: editorReporting({ connected: false, reason: 'There is no project.' }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    expect(await statusText(tool)).toContain('Project: not found. No project.godot was found.');
  });

  it('is read-only, loaded up front and never reported as an error', async () => {
    const tool = new GodotStatusTool({
      project: foundProject,
      editor: editorReporting({ connected: false, reason: 'The editor is not running.' }),
      binaryLocator: binaryFromRunningEditor,
      readVersion: readKnownVersion,
    });

    const result = await tool.execute({});

    expect(tool.name).toBe('godot_status');
    expect(tool.definition.annotations.readOnlyHint).toBe(true);
    expect(tool.definition.alwaysLoad).toBe(true);
    expect(result.isError).toBeFalsy();
  });
});
