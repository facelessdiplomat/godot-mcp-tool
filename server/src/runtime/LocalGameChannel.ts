import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../bridge/BridgeErrors.js';
import { NdjsonDecoder } from '../bridge/NdjsonDecoder.js';

interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

const host = '127.0.0.1';
const gameNotRunningCode = -32006;
const timeoutCode = -32008;

const greetingSchema = z.object({ token: z.string() });
const answerSchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string(), hint: z.string().optional() }).optional(),
});

export class LocalGameChannel {
  private game: Socket | undefined;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private gameWaiters: ((game: Socket) => void)[] = [];
  private nextId = 1;

  private constructor(
    private readonly server: Server,
    readonly port: number,
    private readonly token: string,
  ) {
    server.on('connection', (socket) => {
      this.greet(socket);
    });
  }

  static open(token: string): Promise<LocalGameChannel> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, host, () => {
        const address = server.address();
        resolve(new LocalGameChannel(server, typeof address === 'object' && address !== null ? address.port : 0, token));
      });
    });
  }

  async request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const startedAt = Date.now();
    const game = this.game ?? (await this.connectedGame(timeoutMs));
    if (game === undefined) {
      throw new BridgeRequestError(
        'The game did not connect to the server.',
        gameNotRunningCode,
        'Its runtime agent connects when the game starts; the "Godot MCP Tool" plugin adds it to the project as the autoload GodotMcpRuntime.',
        undefined,
      );
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pendingRequests.delete(id);
          reject(
            new BridgeRequestError(`The game did not answer within ${String(timeoutMs)} ms`, timeoutCode, 'It may be busy or stuck in a long loop; game_get_output shows what it printed.', undefined),
          );
        },
        Math.max(timeoutMs - (Date.now() - startedAt), 1),
      );
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
      game.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  close(): void {
    this.game?.destroy();
    this.failPendingRequests();
    this.server.close();
  }

  private connectedGame(timeoutMs: number): Promise<Socket | undefined> {
    return new Promise((resolve) => {
      const waiter = (game: Socket): void => {
        clearTimeout(timer);
        resolve(game);
      };
      const timer = setTimeout(() => {
        this.gameWaiters = this.gameWaiters.filter((candidate) => candidate !== waiter);
        resolve(undefined);
      }, timeoutMs);
      this.gameWaiters.push(waiter);
    });
  }

  private greet(socket: Socket): void {
    const decoder = new NdjsonDecoder();
    let accepted = false;
    socket.setEncoding('utf8');
    socket.on('error', () => undefined);
    socket.on('close', () => {
      if (this.game === socket) {
        this.game = undefined;
        this.failPendingRequests();
      }
    });
    socket.on('data', (chunk: string) => {
      let messages: unknown[];
      try {
        messages = decoder.decode(chunk);
      } catch {
        socket.destroy();
        return;
      }
      for (const message of messages) {
        if (accepted) {
          this.settle(message);
        } else if (this.game === undefined && this.presentsToken(message)) {
          accepted = true;
          this.game = socket;
          const waiters = this.gameWaiters;
          this.gameWaiters = [];
          for (const waiter of waiters) {
            waiter(socket);
          }
        } else {
          socket.destroy();
          return;
        }
      }
    });
  }

  private presentsToken(message: unknown): boolean {
    const greeting = greetingSchema.safeParse(message);
    if (!greeting.success) {
      return false;
    }
    const presented = Buffer.from(greeting.data.token);
    const expected = Buffer.from(this.token);
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private settle(message: unknown): void {
    const answer = answerSchema.safeParse(message);
    if (!answer.success) {
      return;
    }
    const pendingRequest = this.pendingRequests.get(answer.data.id);
    if (pendingRequest === undefined) {
      return;
    }
    this.pendingRequests.delete(answer.data.id);
    const { error } = answer.data;
    if (error === undefined) {
      pendingRequest.resolve(answer.data.result ?? {});
    } else {
      pendingRequest.reject(new BridgeRequestError(error.message, error.code, error.hint, undefined));
    }
  }

  private failPendingRequests(): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new BridgeRequestError('The game stopped before it answered.', gameNotRunningCode, 'Start it again with game_run.', undefined));
    }
    this.pendingRequests.clear();
  }
}
