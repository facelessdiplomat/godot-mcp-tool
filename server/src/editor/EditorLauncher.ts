import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HelloResult } from '../bridge/BridgeClient.js';
import type { DiscoveryResult } from '../bridge/DiscoveryFileReader.js';
import type { EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import type { DetachedLauncher } from '../process/DetachedLauncher.js';

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export interface EditorLaunchDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorStatusProvider;
  readonly readDiscovery: () => DiscoveryResult;
  readonly locateBinary: () => BinaryLookup;
  readonly launcher: DetachedLauncher;
  readonly clock: Clock;
}

export interface EditorLaunchOptions {
  readonly headless: boolean;
}

export type EditorLaunchResult =
  | { readonly kind: 'already running'; readonly hello: HelloResult }
  | { readonly kind: 'started'; readonly hello: HelloResult; readonly pid: number | undefined; readonly waitedMs: number; readonly logPath: string };

export class EditorLaunchError extends Error {
  override readonly name = 'EditorLaunchError';
}

export const editorConnectTimeoutMs = 180_000;
const pollIntervalMs = 500;
const logLinesShown = 15;
const editorLogPath = join('.godot', 'godot_mcp_tool', 'editor.log');

export class EditorLauncher {
  constructor(private readonly dependencies: EditorLaunchDependencies) {}

  async launch(options: EditorLaunchOptions): Promise<EditorLaunchResult> {
    const { projectRoot, editor, clock } = this.dependencies;
    const current = await editor.status();
    if (current.connected) {
      return { kind: 'already running', hello: current.hello };
    }
    if (projectRoot === undefined) {
      throw new EditorLaunchError('No Godot project was found, so there is no editor to start. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const discovered = this.dependencies.readDiscovery();
    if (discovered.kind === 'found') {
      throw new EditorLaunchError(
        `A Godot editor is already running for this project (process ${String(discovered.endpoint.pid)}), but its plugin does not answer: ${current.reason} Close that editor or restart the plugin there instead of starting a second editor.`,
      );
    }
    const binary = this.dependencies.locateBinary();
    if (!binary.found) {
      throw new EditorLaunchError(binary.reason);
    }
    const logPath = join(projectRoot, editorLogPath);
    mkdirSync(dirname(logPath), { recursive: true });
    const startedAt = clock.now();
    const editorProcess = this.dependencies.launcher.start(binary.path, ['--editor', '--path', projectRoot, ...(options.headless ? ['--headless'] : [])], logPath);
    for (;;) {
      const status = await editor.status();
      if (status.connected) {
        return { kind: 'started', hello: status.hello, pid: editorProcess.pid, waitedMs: clock.now() - startedAt, logPath };
      }
      if (editorProcess.endReason !== undefined) {
        throw new EditorLaunchError(`The Godot editor stopped (${editorProcess.endReason}) before its plugin connected. The end of its output:\n${logTail(logPath)}`);
      }
      if (clock.now() - startedAt >= editorConnectTimeoutMs) {
        throw new EditorLaunchError(
          `The Godot editor started (process ${String(editorProcess.pid)}), but the "Godot MCP Tool" plugin did not connect within ${String(editorConnectTimeoutMs / 1000)} s. Enable the plugin in Project → Project Settings → Plugins, or read ${logPath}.`,
        );
      }
      await clock.sleep(pollIntervalMs);
    }
  }
}

function logTail(logPath: string): string {
  if (!existsSync(logPath)) {
    return '(no output)';
  }
  const lines = readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/);
  return lines.slice(-logLinesShown).join('\n') || '(no output)';
}
