import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageServerClient, LanguageServerUnavailableError } from '../../src/lsp/LanguageServerClient.js';
import { FakeLanguageServer } from '../support/FakeLanguageServer.js';

const projectPath = '/projects/arena';

describe('LanguageServerClient', () => {
  let server: FakeLanguageServer;
  let port: number;
  let client: LanguageServerClient | undefined;

  beforeEach(async () => {
    server = new FakeLanguageServer();
    port = await server.listen();
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await server.close();
  });

  async function connect(timeoutMs = 2_000): Promise<LanguageServerClient> {
    client = await LanguageServerClient.connect({ port, projectPath, timeoutMs });
    return client;
  }

  it('opens the project as its workspace', async () => {
    await connect();

    const [initialize] = server.messages('initialize');
    expect(initialize?.params?.['rootUri']).toBe(pathToFileURL(projectPath).href);
    await expect.poll(() => server.messages('initialized').length).toBe(1);
  });

  it('returns the problems of each file with lines and columns counted from one, then closes the files', async () => {
    server.diagnose = (text) =>
      text.includes('spd')
        ? [
            { line: 11, character: 4, severity: 1, message: 'Identifier "spd" not declared in the current scope.' },
            { line: 2, character: 0, severity: 2, message: 'The local variable "x" is declared but never used.', code: 'UNUSED_VARIABLE' },
          ]
        : [];
    const connected = await connect();

    const results = await connected.diagnose([
      { path: '/projects/arena/player.gd', text: 'extends Node\nvar speed = spd\n' },
      { path: '/projects/arena/enemy.gd', text: 'extends Node\n' },
    ]);

    expect(results.get('/projects/arena/player.gd')).toEqual([
      { line: 3, column: 1, severity: 'warning', code: 'UNUSED_VARIABLE', message: 'The local variable "x" is declared but never used.' },
      { line: 12, column: 5, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' },
    ]);
    expect(results.get('/projects/arena/enemy.gd')).toEqual([]);
    await expect.poll(() => server.messages('textDocument/didClose').length).toBe(2);
  });

  it('reports a problem found twice at the same place once', async () => {
    server.diagnose = () => [
      { line: 4, character: 2, severity: 1, message: 'Expected end of statement after expression.' },
      { line: 4, character: 2, severity: 1, message: 'Unexpected "Identifier" in class body.' },
    ];
    const connected = await connect();

    const results = await connected.diagnose([{ path: '/projects/arena/broken.gd', text: 'extends Node\nvar x = 1 2\n' }]);

    expect(results.get('/projects/arena/broken.gd')).toEqual([{ line: 5, column: 3, severity: 'error', message: 'Expected end of statement after expression.' }]);
  });

  it('refuses a language server that belongs to another project', async () => {
    server.otherWorkspace = '/projects/other';

    await expect(connect()).rejects.toThrow(new LanguageServerUnavailableError(`The language server on port ${String(port)} belongs to another project (/projects/other).`));
  });

  it('reports a language server that is not running', async () => {
    await server.close();

    await expect(connect()).rejects.toBeInstanceOf(LanguageServerUnavailableError);
  });

  it('gives up when the problems of a file do not arrive', async () => {
    server.answerOpenedFiles = false;
    const connected = await connect(50);

    await expect(connected.diagnose([{ path: '/projects/arena/player.gd', text: 'extends Node\n' }])).rejects.toBeInstanceOf(LanguageServerUnavailableError);
  });
});
