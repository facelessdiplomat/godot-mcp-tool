import { connect, type Socket } from 'node:net';
import * as z from 'zod/v4';
import { describeError } from '../util/errors.js';
import { BridgeConnectionError, BridgeProtocolError, BridgeRequestError } from './BridgeErrors.js';
import { NdjsonDecoder } from './NdjsonDecoder.js';

export interface HelloResult {
  readonly protocol: number;
  readonly godotVersion: string;
  readonly addonVersion: string;
  readonly projectPath: string;
  readonly executablePath: string;
  readonly methods: readonly string[];
}

export type NotificationListener = (method: string, params: unknown) => void;

export interface EditorBridge {
  readonly isOpen: boolean;
  connect(): Promise<HelloResult>;
  request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  onNotification(listener: NotificationListener): void;
  close(): void;
}

export interface BridgeAddress {
  readonly port: number;
  readonly token: string;
}

export interface BridgeClientOptions {
  readonly clientName: string;
  readonly protocol: number;
  readonly requestTimeoutMs: number;
}

interface PendingRequest {
  readonly method: string;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const bridgeHost = '127.0.0.1';

const helloResultSchema = z.object({
  protocol: z.number().int(),
  godot_version: z.string(),
  addon_version: z.string(),
  project_path: z.string(),
  executable_path: z.string(),
  methods: z.array(z.string()),
});

const errorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

const errorHintSchema = z.object({ hint: z.string() });

export class BridgeClient implements EditorBridge {
  private socket: Socket | undefined;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly notificationListeners: NotificationListener[] = [];
  private readonly decoder = new NdjsonDecoder();

  constructor(
    private readonly address: BridgeAddress,
    private readonly options: BridgeClientOptions,
  ) {}

  get isOpen(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }

  async connect(): Promise<HelloResult> {
    await this.openSocket();
    const helloResponse = await this.request('hello', {
      token: this.address.token,
      protocol: this.options.protocol,
      client: this.options.clientName,
    });
    const hello = helloResultSchema.safeParse(helloResponse);
    if (!hello.success) {
      this.close();
      throw new BridgeProtocolError(`The editor answered "hello" unexpectedly: ${z.prettifyError(hello.error)}`);
    }
    if (hello.data.protocol !== this.options.protocol) {
      this.close();
      throw new BridgeProtocolError(
        `The editor addon speaks bridge protocol ${String(hello.data.protocol)}, but this server speaks protocol ${String(this.options.protocol)}. Install the matching version of the addon.`,
      );
    }
    return {
      protocol: hello.data.protocol,
      godotVersion: hello.data.godot_version,
      addonVersion: hello.data.addon_version,
      projectPath: hello.data.project_path,
      executablePath: hello.data.executable_path,
      methods: hello.data.methods,
    };
  }

  request(method: string, params: Record<string, unknown> = {}, timeoutMs = this.options.requestTimeoutMs): Promise<unknown> {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return Promise.reject(new BridgeConnectionError('The editor bridge connection is closed.'));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new BridgeConnectionError(`The editor did not answer "${method}" within ${String(timeoutMs)} ms (request timed out).`));
      }, timeoutMs);
      this.pendingRequests.set(id, { method, resolve, reject, timer });
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  onNotification(listener: NotificationListener): void {
    this.notificationListeners.push(listener);
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.failPendingRequests(new BridgeConnectionError('The bridge connection was closed by the MCP server.'));
    socket?.destroy();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: bridgeHost, port: this.address.port });
      socket.setEncoding('utf8');
      socket.setNoDelay(true);
      const failToConnect = (error: Error): void => {
        reject(new BridgeConnectionError(`Could not connect to the editor bridge at ${bridgeHost}:${String(this.address.port)}: ${error.message}`));
      };
      socket.once('error', failToConnect);
      socket.once('connect', () => {
        socket.off('error', failToConnect);
        this.socket = socket;
        socket.on('data', (chunk: string) => {
          this.receive(chunk);
        });
        socket.on('error', (error) => {
          this.handleDisconnect(`The editor bridge connection failed: ${error.message}`);
        });
        socket.on('close', () => {
          this.handleDisconnect('The editor closed the bridge connection.');
        });
        resolve();
      });
    });
  }

  private receive(chunk: string): void {
    let messages: unknown[];
    try {
      messages = this.decoder.decode(chunk);
    } catch (error) {
      this.handleDisconnect(describeError(error));
      return;
    }
    for (const message of messages) {
      this.dispatch(message);
    }
  }

  private dispatch(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }
    const fields = message as Record<string, unknown>;
    const id = fields['id'];
    const method = fields['method'];
    if (typeof method === 'string' && (id === undefined || id === null)) {
      for (const listener of this.notificationListeners) {
        listener(method, fields['params']);
      }
      return;
    }
    if (typeof id !== 'number') {
      return;
    }
    const pendingRequest = this.pendingRequests.get(id);
    if (pendingRequest === undefined) {
      return;
    }
    this.pendingRequests.delete(id);
    clearTimeout(pendingRequest.timer);
    if ('error' in fields) {
      pendingRequest.reject(toRequestError(fields['error'], pendingRequest.method));
      return;
    }
    pendingRequest.resolve(fields['result']);
  }

  private handleDisconnect(reason: string): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.destroy();
    this.failPendingRequests(new BridgeConnectionError(reason));
  }

  private failPendingRequests(error: Error): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
    this.pendingRequests.clear();
  }
}

function toRequestError(error: unknown, method: string): BridgeRequestError {
  const parsedError = errorObjectSchema.safeParse(error);
  if (!parsedError.success) {
    return new BridgeRequestError(`The editor failed "${method}" with a malformed error.`, -32603, undefined, error);
  }
  const hint = errorHintSchema.safeParse(parsedError.data.data);
  return new BridgeRequestError(parsedError.data.message, parsedError.data.code, hint.success ? hint.data.hint : undefined, parsedError.data.data);
}
