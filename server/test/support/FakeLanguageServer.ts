import { createServer, type Server, type Socket } from 'node:net';
import { ContentLengthMessageReader, encodeContentLengthMessage } from '../../src/protocol/ContentLengthMessages.js';

export interface ReceivedLspMessage {
  readonly method?: string;
  readonly id?: number;
  readonly params?: Record<string, unknown>;
}

export interface FakeDiagnostic {
  readonly line: number;
  readonly character: number;
  readonly severity: number;
  readonly message: string;
  readonly code?: string;
}

export class FakeLanguageServer {
  readonly received: ReceivedLspMessage[] = [];
  otherWorkspace: string | undefined;
  answerOpenedFiles = true;
  diagnose: (text: string) => FakeDiagnostic[] = () => [];
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();

  constructor() {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      const reader = new ContentLengthMessageReader();
      socket.on('data', (chunk: Buffer) => {
        for (const message of reader.read(chunk)) {
          this.answer(socket, message as ReceivedLspMessage);
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

  close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  messages(method: string): ReceivedLspMessage[] {
    return this.received.filter((message) => message.method === method);
  }

  private answer(socket: Socket, message: ReceivedLspMessage): void {
    this.received.push(message);
    if (message.method === 'initialize') {
      if (this.otherWorkspace !== undefined) {
        socket.write(encodeContentLengthMessage({ jsonrpc: '2.0', method: 'gdscript_client/changeWorkspace', params: { path: this.otherWorkspace } }));
      }
      socket.write(encodeContentLengthMessage({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } }));
      return;
    }
    if (message.method === 'textDocument/didOpen' && this.answerOpenedFiles) {
      const document = message.params?.['textDocument'] as { uri: string; text: string };
      const diagnostics = this.diagnose(document.text).map((diagnostic) => ({
        range: { start: { line: diagnostic.line, character: diagnostic.character }, end: { line: diagnostic.line, character: diagnostic.character + 1 } },
        severity: diagnostic.severity,
        code: diagnostic.code ?? '',
        source: 'gdscript',
        message: diagnostic.message,
      }));
      socket.write(encodeContentLengthMessage({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: document.uri, diagnostics } }));
    }
  }
}
