import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../bridge/BridgeErrors.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';

export interface HeadlessProjectQuerySetup {
  readonly projectRoot: string | undefined;
  readonly locateGodot: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
}

const queryScript = 'res://addons/godot_mcp_tool/project/project_query.gd';
const queryScriptInProject = join('addons', 'godot_mcp_tool', 'project', 'project_query.gd');
const answerMarker = 'GODOT_MCP_TOOL_ANSWER ';
const queryTimeoutMs = 60_000;
const operationFailedCode = -32010;
const shownErrorLines = 3;

const answerSchema = z.union([
  z.object({ result: z.unknown() }),
  z.object({ error: z.object({ code: z.number(), message: z.string(), hint: z.string().optional() }) }),
]);

export class HeadlessProjectQuery implements EditorGateway {
  constructor(private readonly setup: HeadlessProjectQuerySetup) {}

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const { projectRoot } = this.setup;
    if (projectRoot === undefined) {
      throw new BridgeRequestError(
        'No Godot project was found, so there is nothing to read',
        operationFailedCode,
        'Set GODOT_PROJECT_PATH to the folder with project.godot.',
        undefined,
      );
    }
    if (!existsSync(join(projectRoot, queryScriptInProject))) {
      throw new BridgeRequestError(
        'The Godot editor is not connected, and reading the project without it needs the addon of this server in the project',
        operationFailedCode,
        'Install it with npx godot-mcp-tool install-addon, or start the editor with editor_launch.',
        undefined,
      );
    }
    const binary = await this.setup.locateGodot();
    if (!binary.found) {
      throw new BridgeRequestError(
        `The Godot editor is not connected, and Godot was not found to read the project without it: ${binary.reason}`,
        operationFailedCode,
        'Set GODOT_BIN to the Godot executable, or start the editor with editor_launch.',
        undefined,
      );
    }
    const result = await this.setup.processRunner.run(
      binary.path,
      ['--headless', '--path', projectRoot, '-s', queryScript, '--', method, JSON.stringify(params)],
      { timeoutMs: queryTimeoutMs },
    );
    return outcomeOf(result.stdout, result.stderr);
  }
}

function outcomeOf(stdout: string, stderr: string): unknown {
  const answerLine = stdout.split(/\r?\n/).find((line) => line.startsWith(answerMarker));
  const answer = answerSchema.safeParse(answerLine === undefined ? undefined : parsedJson(answerLine.slice(answerMarker.length)));
  if (!answer.success) {
    const errorLines = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(0, shownErrorLines);
    throw new BridgeRequestError(
      `Godot did not answer while reading the project without the editor: ${errorLines.length === 0 ? 'it printed nothing' : errorLines.join(' | ')}`,
      operationFailedCode,
      'Start the editor with editor_launch, or read project.godot with your file tools.',
      undefined,
    );
  }
  if ('error' in answer.data) {
    throw new BridgeRequestError(answer.data.error.message, answer.data.error.code, answer.data.error.hint, undefined);
  }
  return answer.data.result;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
