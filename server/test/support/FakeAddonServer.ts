import { createServer, type Server, type Socket } from 'node:net';
import { NdjsonDecoder } from '../../src/bridge/NdjsonDecoder.js';

export interface ReceivedRequest {
  readonly id?: number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export class FakeAddonConnection {
  constructor(private readonly socket: Socket) {}

  reply(id: number | undefined, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result });
  }

  fail(id: number | undefined, code: number, message: string, data?: unknown): void {
    this.send({ jsonrpc: '2.0', id, error: { code, message, data } });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  close(): void {
    this.socket.destroy();
  }

  private send(message: unknown): void {
    this.socket.write(`${JSON.stringify(message)}\n`);
  }
}

export type FakeRequestHandler = (request: ReceivedRequest, connection: FakeAddonConnection) => void;

export class FakeAddonServer {
  readonly receivedRequests: ReceivedRequest[] = [];
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();

  constructor(private readonly handleRequest: FakeRequestHandler) {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      socket.setEncoding('utf8');
      const decoder = new NdjsonDecoder();
      const connection = new FakeAddonConnection(socket);
      socket.on('data', (chunk: string) => {
        for (const message of decoder.decode(chunk)) {
          const request = message as ReceivedRequest;
          this.receivedRequests.push(request);
          this.handleRequest(request, connection);
        }
      });
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('The fake addon server has no TCP address'));
          return;
        }
        resolve(address.port);
      });
    });
  }

  stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}

export const helloResultFromEditor = {
  protocol: 1,
  godot_version: '4.8.beta.custom_build.679066724',
  addon_version: '0.1.0',
  project_path: '/projects/game',
  executable_path: '/opt/godot/godot',
  methods: ['hello', 'ping'],
};

export function editorRequiringToken(expectedToken: string): FakeRequestHandler {
  return (request, connection) => {
    if (request.method === 'hello') {
      if (request.params?.['token'] === expectedToken) {
        connection.reply(request.id, helloResultFromEditor);
      } else {
        connection.fail(request.id, -32001, 'Invalid token', { hint: 'Restart the MCP server.' });
        connection.close();
      }
      return;
    }
    if (request.method === 'ping') {
      connection.reply(request.id, { pong: true });
    }
  };
}
