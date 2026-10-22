import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { EditorStatus, EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { BinaryLocator } from '../godot/GodotBinaryLocator.js';
import type { GodotVersion } from '../godot/GodotVersion.js';
import type { ProjectLookup } from '../project/ProjectLocator.js';
import { describeError } from '../util/errors.js';
import { textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

const inputSchema = z.object({});

export interface GodotStatusDependencies {
  readonly project: ProjectLookup;
  readonly editor: EditorStatusProvider;
  readonly binaryLocator: BinaryLocator;
  readonly readVersion: (executablePath: string) => Promise<GodotVersion>;
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
    const statusLines = [this.describeProject(), describeEditor(editorStatus), await this.describeBinary(editorStatus)];
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
      return `${binaryDescription}, version ${version.toString()}`;
    } catch (error) {
      return `${binaryDescription}, version unknown: ${describeError(error)}`;
    }
  }
}

function describeEditor(editorStatus: EditorStatus): string {
  if (!editorStatus.connected) {
    return `Editor: not connected. ${editorStatus.reason}`;
  }
  const { hello } = editorStatus;
  return `Editor: connected. Godot ${hello.godotVersion}, addon ${hello.addonVersion}, bridge protocol ${String(hello.protocol)}`;
}
