import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod/v4';
import { describeError, isErrnoException } from '../util/errors.js';

export const discoveryFileRelativePath = join('.godot', 'godot_mcp_tool', 'bridge.json');

const discoveryFileSchema = z.object({
  protocol: z.number().int(),
  port: z.number().int().min(1).max(65_535),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  godot_version: z.string(),
  addon_version: z.string(),
  project_path: z.string(),
  executable_path: z.string(),
  lsp_port: z.number().int(),
  started_at: z.string(),
});

export interface BridgeEndpoint {
  readonly protocol: number;
  readonly port: number;
  readonly token: string;
  readonly pid: number;
  readonly godotVersion: string;
  readonly addonVersion: string;
  readonly projectPath: string;
  readonly executablePath: string;
  readonly lspPort: number;
  readonly startedAt: string;
}

export type DiscoveryResult =
  | { readonly kind: 'found'; readonly endpoint: BridgeEndpoint }
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'stale'; readonly path: string; readonly pid: number; readonly executablePath: string }
  | { readonly kind: 'invalid'; readonly path: string; readonly reason: string };

export interface DiscoverySource {
  read(): DiscoveryResult;
}

export class DiscoveryFileReader implements DiscoverySource {
  readonly path: string;

  constructor(
    projectRoot: string,
    private readonly isProcessAlive: (pid: number) => boolean,
  ) {
    this.path = join(projectRoot, discoveryFileRelativePath);
  }

  read(): DiscoveryResult {
    let content: string;
    try {
      content = readFileSync(this.path, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return { kind: 'missing', path: this.path };
      }
      return { kind: 'invalid', path: this.path, reason: describeError(error) };
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch (error) {
      return { kind: 'invalid', path: this.path, reason: `not valid JSON (${describeError(error)})` };
    }

    const validation = discoveryFileSchema.safeParse(parsedContent);
    if (!validation.success) {
      return { kind: 'invalid', path: this.path, reason: z.prettifyError(validation.error) };
    }

    const discovery = validation.data;
    if (!this.isProcessAlive(discovery.pid)) {
      return { kind: 'stale', path: this.path, pid: discovery.pid, executablePath: discovery.executable_path };
    }

    return {
      kind: 'found',
      endpoint: {
        protocol: discovery.protocol,
        port: discovery.port,
        token: discovery.token,
        pid: discovery.pid,
        godotVersion: discovery.godot_version,
        addonVersion: discovery.addon_version,
        projectPath: discovery.project_path,
        executablePath: discovery.executable_path,
        lspPort: discovery.lsp_port,
        startedAt: discovery.started_at,
      },
    };
  }

  lastEditorExecutable(): string | undefined {
    const discovered = this.read();
    if (discovered.kind === 'found') {
      return discovered.endpoint.executablePath;
    }
    return discovered.kind === 'stale' ? discovered.executablePath : undefined;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrnoException(error) && error.code === 'EPERM';
  }
}
