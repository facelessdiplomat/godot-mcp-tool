import { connect, type Socket } from 'node:net';

export interface GameRequest {
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export type GameAnswer = (request: GameRequest) => Record<string, unknown> | undefined;

export class FakeGameClient {
  readonly requests: GameRequest[] = [];
  private buffered = '';
  private closed = false;

  private constructor(
    private readonly socket: Socket,
    private readonly answer: GameAnswer,
  ) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.receive(chunk);
    });
    socket.on('close', () => {
      this.closed = true;
    });
  }

  static connect(port: number, token: string, answer: GameAnswer): Promise<FakeGameClient> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1');
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(`${JSON.stringify({ token })}\n`);
        resolve(new FakeGameClient(socket, answer));
      });
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  quit(): void {
    this.socket.destroy();
  }

  private receive(chunk: string): void {
    const lines = (this.buffered + chunk).split('\n');
    this.buffered = lines.pop() ?? '';
    for (const line of lines.filter((candidate) => candidate.trim() !== '')) {
      const request = JSON.parse(line) as GameRequest;
      this.requests.push(request);
      const answer = this.answer(request);
      if (answer !== undefined) {
        this.socket.write(`${JSON.stringify(answer)}\n`);
      }
    }
  }
}
