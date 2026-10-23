import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../bridge/BridgeErrors.js';
import type { EditorGateway, EditorRequestOptions } from '../editor/EditorGateway.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import type { LaunchedProcess, ProcessLauncher } from '../process/ProcessLauncher.js';
import { readConfigSections } from '../project/ConfigText.js';
import { LocalGameChannel } from './LocalGameChannel.js';
import { LogBook } from './LogBook.js';
import { RecordFile } from './RecordFile.js';

export interface LocalGameOptions {
  readonly projectRoot: string | undefined;
  readonly locateBinary: () => BinaryLookup;
  readonly launcher: ProcessLauncher;
  readonly headless: boolean;
  readonly startupTimeoutMs?: number;
  readonly pollIntervalMs?: number;
}

type GameState = 'stopped' | 'starting' | 'running';

const methodNotFoundCode = -32601;
const invalidParamsCode = -32602;
const notFoundCode = -32004;
const noSceneCode = -32005;
const gameNotRunningCode = -32006;
const unsafeDisabledCode = -32009;
const operationFailedCode = -32010;

const gameRequests: Readonly<Record<string, string>> = {
  'game.get_tree': 'tree',
  'game.get_properties': 'properties.get',
  'game.set_properties': 'properties.set',
  'game.wait': 'wait',
  'game.input': 'input',
  'game.screenshot': 'screenshot',
  'game.pause': 'pause',
  'game.step': 'step',
  'game.performance': 'performance',
  'game.eval': 'eval',
};
const evaluationMethod = 'game.eval';
const defaultGameRequestTimeoutMs = 30_000;
const tokenBytes = 24;
const tokenVariable = 'GODOT_MCP_GAME_TOKEN';
const projectMetadataPath = join('.godot', 'editor', 'project_metadata.cfg');
const addonSettingsSection = 'godot_mcp_tool';
const unsafeToolsKey = 'allow_unsafe_tools';

const defaultStartupTimeoutMs = 30_000;
const defaultPollIntervalMs = 50;
const stopTimeoutMs = 10_000;
const outputLimit = 60;
const rememberedOutputLines = 40;
const gameSource = 'game';
const processSource = 'process';

const runParamsSchema = z.object({
  scene: z.string().default('main'),
  watch_ms: z.number().int().min(0).default(1000),
  stop_after: z.boolean().default(false),
  fixed_fps: z.number().int().min(1).max(1000).optional(),
});

type RunParams = z.infer<typeof runParamsSchema>;

const outputParamsSchema = z.object({
  after: z.number().int().default(-1),
  levels: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(500).default(100),
});

type OutputParams = z.infer<typeof outputParamsSchema>;

const logRecordSchema = z.object({ type: z.literal('log'), entry: z.record(z.string(), z.unknown()) });
const readyRecordSchema = z.object({ type: z.literal('ready'), scene: z.string() });

export class LocalGameGateway implements EditorGateway {
  private readonly book = new LogBook();
  private readonly records: RecordFile | undefined;
  private process: LaunchedProcess | undefined;
  private channel: LocalGameChannel | undefined;
  private readyScene: string | undefined;
  private runFirstSeq = 1;
  private stopRequested = false;
  private recentOutput: string[] = [];

  constructor(private readonly options: LocalGameOptions) {
    this.records = options.projectRoot === undefined ? undefined : new RecordFile(join(options.projectRoot, '.godot', 'godot_mcp_tool', 'local_game.ndjson'));
  }

  get isRunning(): boolean {
    return this.process !== undefined && !this.process.hasExited;
  }

  async request(method: string, params: Record<string, unknown>, options: EditorRequestOptions = {}): Promise<unknown> {
    const gameMethod = gameRequests[method];
    if (gameMethod !== undefined) {
      return this.askGame(method, gameMethod, params, options.timeoutMs ?? defaultGameRequestTimeoutMs);
    }
    switch (method) {
      case 'game.run':
        return this.run(parseParams(runParamsSchema, params));
      case 'game.stop':
        return this.stop();
      case 'game.get_output':
        return this.output(parseParams(outputParamsSchema, params));
      default:
        throw new BridgeRequestError(
          `${method} needs the Godot editor`,
          methodNotFoundCode,
          'Open the project in the Godot editor with the "Godot MCP Tool" plugin enabled.',
          undefined,
        );
    }
  }

  shutdown(): void {
    this.process?.stop();
    this.channel?.close();
  }

  private askGame(method: string, gameMethod: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (this.channel === undefined || !this.isRunning) {
      throw new BridgeRequestError('The game is not running', gameNotRunningCode, 'Start it with game_run.', undefined);
    }
    if (method === evaluationMethod && !this.allowsUnsafeTools()) {
      throw new BridgeRequestError(
        'Unsafe tools are turned off in the editor for this project',
        unsafeDisabledCode,
        'The user can turn them on in the editor with Project → Tools → Godot MCP Tool → Allow Unsafe Tools.',
        undefined,
      );
    }
    return this.channel.request(gameMethod, params, timeoutMs);
  }

  private allowsUnsafeTools(): boolean {
    const { projectRoot } = this.options;
    if (projectRoot === undefined) {
      return false;
    }
    try {
      const metadata = readConfigSections(readFileSync(join(projectRoot, projectMetadataPath), 'utf8'));
      return metadata.find((section) => section.name === addonSettingsSection)?.values.get(unsafeToolsKey) === 'true';
    } catch {
      return false;
    }
  }

  private async run(params: RunParams): Promise<unknown> {
    const { projectRoot, records, binaryPath } = this.prepareRun(params.scene);
    await this.stop();
    this.beginRun(records);
    const token = randomBytes(tokenBytes).toString('base64url');
    const channel = await LocalGameChannel.open(token);
    this.channel = channel;
    const startedAt = Date.now();
    const launched = this.options.launcher.launch(binaryPath, this.launchArguments(projectRoot, params, records.path, channel.port), projectRoot, { [tokenVariable]: token });
    this.process = launched;
    launched.onOutput((text) => {
      this.rememberOutput(text);
    });
    launched.onExit((exitCode) => {
      this.recordExit(launched, exitCode);
    });
    await this.waitUntil(() => this.readyScene !== undefined || launched.hasExited, this.options.startupTimeoutMs ?? defaultStartupTimeoutMs);
    const outcome = this.readyScene !== undefined ? 'ready' : launched.hasExited ? 'stopped' : 'timeout';
    const startupMs = Date.now() - startedAt;
    if (outcome === 'ready') {
      await this.waitUntil(() => launched.hasExited, params.watch_ms);
      if (params.stop_after) {
        await this.stop();
      }
    }
    const page = this.book.entriesAfter(this.runFirstSeq - 1, [], outputLimit);
    return {
      scene: this.readyScene ?? (params.scene === 'main' ? 'the main scene' : params.scene),
      outcome,
      state: this.currentState(),
      startup_ms: startupMs,
      output: page.entries,
      more_output: page.more,
      next_after: page.next_after,
      saved_scenes: [],
      saved_scripts: [],
    };
  }

  private prepareRun(scene: string): { projectRoot: string; records: RecordFile; binaryPath: string } {
    if (scene === 'current') {
      throw new BridgeRequestError(
        'There is no current scene without the Godot editor',
        noSceneCode,
        'Run "main" or a scene by its res:// path, or open the project in the Godot editor.',
        undefined,
      );
    }
    const { projectRoot } = this.options;
    if (projectRoot === undefined || this.records === undefined) {
      throw new BridgeRequestError('No Godot project was found, so there is no game to run', operationFailedCode, 'Set GODOT_PROJECT_PATH to the folder with project.godot.', undefined);
    }
    if (scene !== 'main') {
      validateScene(projectRoot, scene);
    }
    const binary = this.options.locateBinary();
    if (!binary.found) {
      throw new BridgeRequestError('The Godot editor is not connected and no Godot executable was found to run the game', operationFailedCode, binary.reason, undefined);
    }
    return { projectRoot, records: this.records, binaryPath: binary.path };
  }

  private beginRun(records: RecordFile): void {
    mkdirSync(dirname(records.path), { recursive: true });
    rmSync(records.path, { force: true });
    records.reset();
    this.runFirstSeq = this.book.lastSeq + 1;
    this.readyScene = undefined;
    this.stopRequested = false;
    this.recentOutput = [];
  }

  private launchArguments(projectRoot: string, params: RunParams, logFile: string, port: number): string[] {
    return [
      '--path',
      projectRoot,
      ...(this.options.headless ? ['--headless'] : []),
      ...(params.fixed_fps === undefined ? [] : ['--fixed-fps', String(params.fixed_fps)]),
      ...(params.scene === 'main' ? [] : [params.scene]),
      '--',
      `--mcp-log-file=${logFile}`,
      `--mcp-port=${String(port)}`,
    ];
  }

  private async stop(): Promise<{ was_running: boolean }> {
    const running = this.process;
    if (running === undefined || running.hasExited) {
      return { was_running: false };
    }
    this.stopRequested = true;
    running.stop();
    await this.waitUntil(() => running.hasExited, stopTimeoutMs);
    this.channel?.close();
    this.channel = undefined;
    return { was_running: true };
  }

  private output(params: OutputParams): unknown {
    this.drain();
    const runStart = this.runFirstSeq - 1;
    const cursor = params.after > this.book.lastSeq ? runStart : Math.max(params.after, runStart);
    return { ...this.book.entriesAfter(cursor, params.levels, params.limit), state: this.currentState() };
  }

  private currentState(): GameState {
    if (this.process === undefined || this.process.hasExited) {
      return 'stopped';
    }
    return this.readyScene === undefined ? 'starting' : 'running';
  }

  private recordExit(launched: LaunchedProcess, exitCode: number | null): void {
    if (launched !== this.process || this.stopRequested) {
      return;
    }
    this.channel?.close();
    this.channel = undefined;
    this.drain();
    if (exitCode === 0) {
      this.book.append({ level: 'info', message: 'The game quit with exit code 0.' }, processSource);
      return;
    }
    const lastOutput = this.recentOutput.length === 0 ? '' : `\nIts last output:\n${this.recentOutput.join('\n')}`;
    const ending = exitCode === null ? 'was stopped by a signal' : `exited with code ${String(exitCode)}`;
    this.book.append({ level: 'error', message: `The game ${ending}${this.readyScene === undefined ? ' before it was ready' : ''}.${lastOutput}` }, processSource);
  }

  private drain(): void {
    for (const record of this.records?.readNew() ?? []) {
      const log = logRecordSchema.safeParse(record);
      if (log.success) {
        this.book.append(log.data.entry, gameSource);
        continue;
      }
      const ready = readyRecordSchema.safeParse(record);
      if (ready.success) {
        this.readyScene = ready.data.scene;
      }
    }
  }

  private rememberOutput(text: string): void {
    this.recentOutput.push(...text.split('\n').filter((line) => line.trim() !== ''));
    if (this.recentOutput.length > rememberedOutputLines) {
      this.recentOutput.splice(0, this.recentOutput.length - rememberedOutputLines);
    }
  }

  private async waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      this.drain();
      if (condition()) {
        return true;
      }
      if (Date.now() >= deadline) {
        return false;
      }
      await delay(this.options.pollIntervalMs ?? defaultPollIntervalMs);
    }
  }
}

function parseParams<Schema extends z.ZodType>(schema: Schema, params: Record<string, unknown>): z.output<Schema> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw new BridgeRequestError(`Invalid params: ${z.prettifyError(parsed.error)}`, invalidParamsCode, undefined, undefined);
  }
  return parsed.data;
}

function validateScene(projectRoot: string, scene: string): void {
  if (!scene.startsWith('res://') || !(scene.endsWith('.tscn') || scene.endsWith('.scn'))) {
    throw new BridgeRequestError(`"${scene}" is not a scene path`, invalidParamsCode, 'Scene paths look like res://levels/arena.tscn.', undefined);
  }
  if (!existsSync(join(projectRoot, scene.slice('res://'.length)))) {
    throw new BridgeRequestError(`Scene ${scene} not found`, notFoundCode, 'Check the path.', undefined);
  }
}
