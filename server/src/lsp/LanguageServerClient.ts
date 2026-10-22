import { connect, type Socket } from 'node:net';
import { normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as z from 'zod/v4';
import { describeError } from '../util/errors.js';
import { encodeLspMessage, LspMessageReader } from './LspMessageReader.js';

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface Diagnostic {
  readonly line: number;
  readonly column: number;
  readonly severity: DiagnosticSeverity;
  readonly code?: string;
  readonly message: string;
}

export interface ScriptText {
  readonly path: string;
  readonly text: string;
}

export interface LanguageServerConnection {
  readonly port: number;
  readonly projectPath: string;
  readonly timeoutMs?: number;
}

export class LanguageServerUnavailableError extends Error {
  override readonly name = 'LanguageServerUnavailableError';
}

interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

const languageServerHost = '127.0.0.1';
const defaultTimeoutMs = 10_000;
const severities: readonly DiagnosticSeverity[] = ['error', 'warning', 'information', 'hint'];

const responseSchema = z.object({ id: z.number(), result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() });
const notificationSchema = z.object({ method: z.string(), params: z.unknown().optional() });
const changeWorkspaceSchema = z.object({ path: z.string() });
const publishedDiagnosticsSchema = z.object({
  uri: z.string(),
  diagnostics: z.array(
    z.object({
      range: z.object({ start: z.object({ line: z.number(), character: z.number() }) }),
      severity: z.number().optional(),
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string(),
    }),
  ),
});

export class LanguageServerClient {
  private readonly reader = new LspMessageReader();
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly diagnosticsListeners = new Map<string, (diagnostics: Diagnostic[]) => void>();
  private nextRequestId = 1;
  private otherWorkspace: string | undefined;
  private closedReason: string | undefined;

  private constructor(
    private readonly socket: Socket,
    private readonly timeoutMs: number,
  ) {
    socket.on('data', (chunk: Buffer) => {
      this.receive(chunk);
    });
    socket.on('error', (error) => {
      this.fail(`The language server connection failed: ${error.message}`);
    });
    socket.on('close', () => {
      this.fail('The language server closed the connection.');
    });
  }

  static async connect(connection: LanguageServerConnection): Promise<LanguageServerClient> {
    const timeoutMs = connection.timeoutMs ?? defaultTimeoutMs;
    const socket = await openSocket(connection.port, timeoutMs);
    const client = new LanguageServerClient(socket, timeoutMs);
    try {
      await client.request('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(connection.projectPath).href,
        rootPath: connection.projectPath,
        capabilities: {},
      });
      if (client.otherWorkspace !== undefined && !isSamePath(client.otherWorkspace, connection.projectPath)) {
        throw new LanguageServerUnavailableError(
          `The language server on port ${String(connection.port)} belongs to another project (${client.otherWorkspace}).`,
        );
      }
      client.notify('initialized', {});
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  async diagnose(scripts: readonly ScriptText[]): Promise<Map<string, Diagnostic[]>> {
    const results = new Map<string, Diagnostic[]>();
    const arrivals = scripts.map((script) =>
      this.waitForDiagnostics(script.path).then((diagnostics) => {
        results.set(script.path, diagnostics);
      }),
    );
    for (const script of scripts) {
      this.notify('textDocument/didOpen', { textDocument: { uri: pathToFileURL(script.path).href, languageId: 'gdscript', version: 1, text: script.text } });
    }
    try {
      await Promise.all(arrivals);
    } finally {
      for (const script of scripts) {
        this.notify('textDocument/didClose', { textDocument: { uri: pathToFileURL(script.path).href } });
      }
    }
    return results;
  }

  close(): void {
    this.socket.destroy();
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new LanguageServerUnavailableError(`The language server did not answer "${method}" within ${String(this.timeoutMs)} ms.`));
      }, this.timeoutMs);
      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: unknown): void {
    if (this.closedReason === undefined) {
      this.socket.write(encodeLspMessage(message));
    }
  }

  private waitForDiagnostics(path: string): Promise<Diagnostic[]> {
    const key = normalize(path);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.diagnosticsListeners.delete(key);
        reject(new LanguageServerUnavailableError(`The language server did not report the problems of ${path} within ${String(this.timeoutMs)} ms.`));
      }, this.timeoutMs);
      this.diagnosticsListeners.set(key, (diagnostics) => {
        clearTimeout(timer);
        this.diagnosticsListeners.delete(key);
        resolve(diagnostics);
      });
    });
  }

  private receive(chunk: Buffer): void {
    let messages: unknown[];
    try {
      messages = this.reader.read(chunk);
    } catch (error) {
      this.fail(describeError(error));
      this.close();
      return;
    }
    for (const message of messages) {
      this.dispatch(message);
    }
  }

  private dispatch(message: unknown): void {
    const response = responseSchema.safeParse(message);
    if (response.success) {
      const pending = this.pendingRequests.get(response.data.id);
      this.pendingRequests.delete(response.data.id);
      if (response.data.error === undefined) {
        pending?.resolve(response.data.result);
      } else {
        pending?.reject(new LanguageServerUnavailableError(`The language server refused the request: ${response.data.error.message}`));
      }
      return;
    }
    const notification = notificationSchema.safeParse(message);
    if (!notification.success) {
      return;
    }
    if (notification.data.method === 'gdscript_client/changeWorkspace') {
      const workspace = changeWorkspaceSchema.safeParse(notification.data.params);
      this.otherWorkspace = workspace.success ? workspace.data.path : this.otherWorkspace;
      return;
    }
    if (notification.data.method === 'textDocument/publishDiagnostics') {
      this.deliverDiagnostics(notification.data.params);
    }
  }

  private deliverDiagnostics(params: unknown): void {
    const published = publishedDiagnosticsSchema.safeParse(params);
    if (!published.success) {
      return;
    }
    const listener = this.diagnosticsListeners.get(normalize(fileURLToPath(published.data.uri)));
    listener?.(uniqueByPlace(published.data.diagnostics.map(toDiagnostic)));
  }

  private fail(reason: string): void {
    this.closedReason ??= reason;
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new LanguageServerUnavailableError(reason));
    }
    this.pendingRequests.clear();
  }
}

function openSocket(port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: languageServerHost, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new LanguageServerUnavailableError(`Could not reach the language server on ${languageServerHost}:${String(port)} within ${String(timeoutMs)} ms.`));
    }, timeoutMs);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(new LanguageServerUnavailableError(`Could not reach the language server on ${languageServerHost}:${String(port)}: ${error.message}`));
    });
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.removeAllListeners('error');
      resolve(socket);
    });
  });
}

function toDiagnostic(published: z.infer<typeof publishedDiagnosticsSchema>['diagnostics'][number]): Diagnostic {
  const code = published.code === undefined ? '' : String(published.code);
  return {
    line: published.range.start.line + 1,
    column: published.range.start.character + 1,
    severity: severities[(published.severity ?? 1) - 1] ?? 'error',
    ...(code === '' ? {} : { code }),
    message: published.message,
  };
}

function uniqueByPlace(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const place = `${String(diagnostic.line)}:${String(diagnostic.column)}`;
    if (!seen.has(place)) {
      seen.add(place);
      unique.push(diagnostic);
    }
  }
  return unique.sort((left, right) => left.line - right.line || left.column - right.column);
}

function isSamePath(left: string, right: string): boolean {
  return normalize(`${left}/`) === normalize(`${right}/`);
}
