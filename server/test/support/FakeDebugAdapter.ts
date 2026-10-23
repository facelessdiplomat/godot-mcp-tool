import { createServer, type Server, type Socket } from 'node:net';
import { ContentLengthMessageReader, encodeContentLengthMessage } from '../../src/protocol/ContentLengthMessages.js';

export interface ReceivedDapRequest {
  readonly seq: number;
  readonly command: string;
  readonly arguments: Record<string, unknown>;
}

export interface FakeDapAnswer {
  readonly success: boolean;
  readonly body?: Record<string, unknown>;
  readonly message?: string;
}

export class FakeDebugAdapter {
  readonly received: ReceivedDapRequest[] = [];
  answer: (request: ReceivedDapRequest) => FakeDapAnswer | undefined = () => ({ success: true });
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private nextSeq = 1;

  constructor() {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      const reader = new ContentLengthMessageReader();
      socket.on('data', (chunk: Buffer) => {
        for (const message of reader.read(chunk)) {
          const request = message as ReceivedDapRequest;
          this.received.push(request);
          const answer = this.answer(request);
          if (answer !== undefined) {
            this.send(socket, { type: 'response', request_seq: request.seq, command: request.command, ...answer });
          }
        }
      });
      socket.on('close', () => {
        this.sockets.delete(socket);
      });
    });
  }

  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });
  }

  get connectedClients(): number {
    return this.sockets.size;
  }

  emit(event: string, body: Record<string, unknown> = {}): void {
    for (const socket of this.sockets) {
      this.send(socket, { type: 'event', event, body });
    }
  }

  disconnectClients(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
  }

  close(): Promise<void> {
    this.disconnectClients();
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private send(socket: Socket, message: Record<string, unknown>): void {
    socket.write(encodeContentLengthMessage({ seq: this.nextSeq++, ...message }));
  }
}
