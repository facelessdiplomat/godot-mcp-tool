import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { type Application, createApplication } from '../../src/createApplication.js';

export const godotBinary = process.env['GODOT_BIN'] ?? '';
export const editorStartupTimeoutMs = 120_000;

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
export const testProjectRoot = join(repositoryRoot, 'test-project');
const addonDirectory = join(repositoryRoot, 'addon', 'addons', 'godot_mcp_tool');
const testHelperDirectory = join(import.meta.dirname, 'fixtures', 'mcp_test_helper');
const testHelperTimeoutMs = 10_000;

export interface ToolOutcome {
  readonly text: string;
  readonly isError: boolean;
}

export async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`The condition was not met within ${String(timeoutMs)} ms`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
}

export async function startHeadlessEditor(projectRoot: string): Promise<ChildProcess> {
  const discovery = new DiscoveryFileReader(projectRoot, isProcessAlive);
  const editorProcess = spawn(godotBinary, ['--headless', '--editor', '--path', projectRoot], { stdio: 'ignore' });
  await waitFor(() => {
    const discovered = discovery.read();
    return discovered.kind === 'found' && discovered.endpoint.pid === editorProcess.pid;
  }, editorStartupTimeoutMs);
  return editorProcess;
}

export class McpSession {
  private constructor(
    private readonly application: Application,
    readonly client: Client,
  ) {}

  static async connect(projectRoot: string, variables: Readonly<Record<string, string>> = {}): Promise<McpSession> {
    const application = createApplication({
      variables: { GODOT_PROJECT_PATH: projectRoot, ...variables },
      workingDirectory: projectRoot,
      platform: process.platform,
      homeDirectory: homedir(),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await application.createMcpServer().connect(serverTransport);
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    await client.connect(clientTransport);
    return new McpSession(application, client);
  }

  async call(name: string, toolArguments: Record<string, unknown> = {}): Promise<ToolOutcome> {
    const result = await this.client.callTool({ name, arguments: toolArguments });
    const [content] = result.content;
    return { text: content?.type === 'text' ? content.text : '', isError: result.isError === true };
  }

  async close(): Promise<void> {
    await this.client.close();
    this.application.shutdown();
  }
}

export interface TemporaryProjectOptions {
  readonly withTestHelper?: boolean;
  readonly mainScene?: string;
  readonly withRuntimeAutoload?: boolean;
}

export class TemporaryProject {
  readonly root: string;

  constructor(name: string, options: TemporaryProjectOptions = {}) {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'godot-mcp-tool-')));
    const plugins = ['"res://addons/godot_mcp_tool/plugin.cfg"'];
    if (options.withTestHelper === true) {
      plugins.push('"res://addons/mcp_test_helper/plugin.cfg"');
    }
    writeFileSync(
      join(this.root, 'project.godot'),
      [
        'config_version=5',
        '',
        '[application]',
        '',
        `config/name="${name}"`,
        ...(options.mainScene === undefined ? [] : [`run/main_scene="${options.mainScene}"`]),
        'config/features=PackedStringArray("4.8")',
        '',
        ...(options.withRuntimeAutoload === true ? ['[autoload]', '', 'GodotMcpRuntime="*res://addons/godot_mcp_tool/runtime/runtime_agent.gd"', ''] : []),
        '[editor_plugins]',
        '',
        `enabled=PackedStringArray(${plugins.join(', ')})`,
        '',
      ].join('\n'),
    );
    mkdirSync(join(this.root, 'addons'));
    symlinkSync(addonDirectory, join(this.root, 'addons', 'godot_mcp_tool'));
    if (options.withTestHelper === true) {
      symlinkSync(testHelperDirectory, join(this.root, 'addons', 'mcp_test_helper'));
    }
  }

  write(relativePath: string, content: string): void {
    writeFileSync(this.path(relativePath), content);
  }

  read(relativePath: string): string {
    return readFileSync(this.path(relativePath), 'utf8');
  }

  path(relativePath: string): string {
    return join(this.root, relativePath);
  }

  remove(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

export class EditorTestHelper {
  constructor(private readonly project: TemporaryProject) {}

  async request(action: string, details: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const responsePath = this.project.path('.mcp_test_response.json');
    rmSync(responsePath, { force: true });
    this.project.write('.mcp_test_request.json', JSON.stringify({ action, ...details }));
    await waitFor(() => existsSync(responsePath), testHelperTimeoutMs);
    const response = JSON.parse(readFileSync(responsePath, 'utf8')) as Record<string, unknown>;
    rmSync(responsePath, { force: true });
    return response;
  }
}
