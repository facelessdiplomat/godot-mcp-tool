import { connect, type Socket } from 'node:net';
import * as z from 'zod/v4';
import { ContentLengthMessageReader, encodeContentLengthMessage } from '../protocol/ContentLengthMessages.js';

export interface DebugAdapterEvent {
  readonly event: string;
  readonly body: Record<string, unknown>;
}

export interface DebugAdapterConnection {
  readonly isOpen: boolean;
  request(command: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  onEvent(listener: (event: DebugAdapterEvent) => void): void;
  close(): void;
}

export class DebugAdapterUnavailableError extends Error {
  override readonly name = 'DebugAdapterUnavailableError';
}

export class DebugAdapterRequestError extends Error {
  override readonly name = 'DebugAdapterRequestError';

  constructor(
    message: string,
    readonly code: string,
    readonly variables: Readonly<Record<string, string>>,
  ) {
    super(message);
  }
}

interface PendingRequest {
  readonly resolve: (body: unknown) => void;
  readonly reject: (error: Error) => void;
}

const debugAdapterHost = '127.0.0.1';
const defaultTimeoutMs = 10_000;
const connectTimeoutMs = 5_000;

const responseSchema = z.object({
  type: z.literal('response'),
  request_seq: z.number(),
  success: z.boolean(),
  message: z.string().optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

type DebugAdapterResponse = z.infer<typeof responseSchema>;

const eventSchema = z.object({ type: z.literal('event'), event: z.string(), body: z.record(z.string(), z.unknown()).optional() });
const errorBodySchema = z.object({ error: z.object({ format: z.string(), variables: z.record(z.string(), z.unknown()).optional() }) });

export class DebugAdapterClient implements DebugAdapterConnection {
  private readonly reader = new ContentLengthMessageReader();
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly eventListeners: ((event: DebugAdapterEvent) => void)[] = [];
  private nextSeq = 1;
  private closedReason: string | undefined;

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.receive(chunk);
    });
    socket.on('error', (error) => {
      this.fail(`The debug adapter connection failed: ${error.message}`);
    });
    socket.on('close', () => {
      this.fail('The debug adapter closed the connection.');
    });
  }

  static connect(port: number): Promise<DebugAdapterClient> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, debugAdapterHost);
      const refuse = (error: Error): void => {
        clearTimeout(timer);
        reject(new DebugAdapterUnavailableError(`No debug adapter listens on port ${String(port)}: ${error.message}`));
      };
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new DebugAdapterUnavailableError(`No debug adapter answered on port ${String(port)} within ${String(connectTimeoutMs)} ms.`));
      }, connectTimeoutMs);
      socket.once('error', refuse);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.off('error', refuse);
        resolve(new DebugAdapterClient(socket));
      });
    });
  }

  get isOpen(): boolean {
    return this.closedReason === undefined;
  }

  request(command: string, args: Record<string, unknown> = {}, timeoutMs = defaultTimeoutMs): Promise<unknown> {
    if (this.closedReason !== undefined) {
      return Promise.reject(new DebugAdapterUnavailableError(this.closedReason));
    }
    const seq = this.nextSeq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(new DebugAdapterUnavailableError(`The debug adapter did not answer "${command}" within ${String(timeoutMs)} ms.`));
      }, timeoutMs);
      this.pendingRequests.set(seq, {
        resolve: (body) => {
          clearTimeout(timer);
          resolve(body);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.write(encodeContentLengthMessage({ seq, type: 'request', command, arguments: args }));
    });
  }

  onEvent(listener: (event: DebugAdapterEvent) => void): void {
    this.eventListeners.push(listener);
  }

  close(): void {
    this.fail('The debug adapter connection was closed.');
    this.socket.destroy();
  }

  private receive(chunk: Buffer): void {
    let messages: unknown[];
    try {
      messages = this.reader.read(chunk);
    } catch (error) {
      this.fail(`The debug adapter sent a message that could not be read: ${error instanceof Error ? error.message : 'unknown error'}`);
      this.socket.destroy();
      return;
    }
    for (const message of messages) {
      const response = responseSchema.safeParse(message);
      if (response.success) {
        this.settle(response.data);
        continue;
      }
      const event = eventSchema.safeParse(message);
      if (event.success) {
        for (const listener of this.eventListeners) {
          listener({ event: event.data.event, body: event.data.body ?? {} });
        }
      }
    }
  }

  private settle(response: DebugAdapterResponse): void {
    const pendingRequest = this.pendingRequests.get(response.request_seq);
    if (pendingRequest === undefined) {
      return;
    }
    this.pendingRequests.delete(response.request_seq);
    if (response.success) {
      pendingRequest.resolve(response.body ?? {});
    } else {
      pendingRequest.reject(requestErrorOf(response));
    }
  }

  private fail(reason: string): void {
    if (this.closedReason !== undefined) {
      return;
    }
    this.closedReason = reason;
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new DebugAdapterUnavailableError(reason));
    }
    this.pendingRequests.clear();
  }
}

function requestErrorOf(response: DebugAdapterResponse): DebugAdapterRequestError {
  const code = response.message ?? 'unknown';
  const details = errorBodySchema.safeParse(response.body);
  if (!details.success) {
    return new DebugAdapterRequestError(`The debug adapter refused the request (${code}).`, code, {});
  }
  const variables = Object.fromEntries(
    Object.entries(details.data.error.variables ?? {}).map(([name, value]) => [name, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
  const message = details.data.error.format.replace(/\{(\w+)\}/g, (placeholder, name: string) => variables[name] ?? placeholder);
  return new DebugAdapterRequestError(message, code, variables);
}
