import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { EditorStatus, EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { BinaryLocator } from '../godot/GodotBinaryLocator.js';
import type { GodotVersion } from '../godot/GodotVersion.js';
import { isSupportedGodotVersion, minimumGodotVersionText } from '../godot/supportedGodotVersion.js';
import type { ProjectLookup } from '../project/ProjectLocator.js';
import { SERVER_VERSION } from '../serverInfo.js';
import { describeError } from '../util/errors.js';
import { textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

const inputSchema = z.object({});

export interface GodotStatusDependencies {
  readonly project: ProjectLookup;
  readonly editor: EditorStatusProvider;
  readonly binaryLocator: BinaryLocator;
  readonly readVersion: (executablePath: string) => Promise<GodotVersion>;
  readonly toolNotes?: readonly string[] | undefined;
}

export class GodotStatusTool implements Tool<typeof inputSchema> {
  readonly name = 'godot_status';

  readonly definition: ToolDefinition<typeof inputSchema> = {
    title: 'Godot status',
    description:
      'Check the connection to Godot: which project is used, whether the Godot editor with the "Godot MCP Tool" plugin is connected, and which Godot executable and version are available. Call it first when another Godot tool reports a connection problem.',
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    alwaysLoad: true,
  };

  constructor(private readonly dependencies: GodotStatusDependencies) {}

  async execute(_input: z.input<typeof inputSchema>): Promise<CallToolResult> {
    const editorStatus = await this.dependencies.editor.status();
    const statusLines = [this.describeProject(), describeEditor(editorStatus), await this.describeBinary(editorStatus), ...(this.dependencies.toolNotes ?? [])];
    return textResult(statusLines.join('\n'));
  }

  private describeProject(): string {
    const { project } = this.dependencies;
    return project.found ? `Project: ${project.root} (from ${project.source})` : `Project: not found. ${project.reason}`;
  }

  private async describeBinary(editorStatus: EditorStatus): Promise<string> {
    const runningEditorExecutable = editorStatus.connected ? editorStatus.hello.executablePath : undefined;
    const binary = this.dependencies.binaryLocator.locate(runningEditorExecutable);
    if (!binary.found) {
      return `Godot binary: not found. ${binary.reason}`;
    }
    const binaryDescription = `Godot binary: ${binary.path} (from ${binary.source})`;
    try {
      const version = await this.dependencies.readVersion(binary.path);
      return isSupportedGodotVersion(version)
        ? `${binaryDescription}, version ${version.toString()}`
        : `${binaryDescription}, version ${version.toString()}, older than ${minimumGodotVersionText}, which Godot MCP Tool needs: set GODOT_BIN to Godot ${minimumGodotVersionText} or newer.`;
    } catch (error) {
      return `${binaryDescription}, version unknown: ${describeError(error)}`;
    }
  }
}

function describeEditor(editorStatus: EditorStatus): string {
  if (!editorStatus.connected) {
    return `Editor: not connected. ${editorStatus.reason} Start it with editor_launch.`;
  }
  const { hello } = editorStatus;
  const connection = `Editor: connected. Godot ${hello.godotVersion}, addon ${hello.addonVersion}, bridge protocol ${String(hello.protocol)}`;
  return hello.addonVersion === SERVER_VERSION
    ? connection
    : `${connection}. The addon is not the version of this server (${SERVER_VERSION}): close the editor, run npx godot-mcp-tool update-addon in the project folder and open the editor again.`;
}
