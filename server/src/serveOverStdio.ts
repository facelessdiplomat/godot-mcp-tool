import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApplication } from './createApplication.js';
import type { ApplicationEnvironment } from './createGodotContext.js';

export function serveOverStdio(environment: ApplicationEnvironment): void {
  const application = createApplication(environment);
  const stdioServer = serveStdio(() => application.createMcpServer(), {
    onerror: (error) => {
      console.error(error);
    },
  });

  let shuttingDown = false;

  function shutDown(): void {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    application.shutdown();
    void stdioServer.close().finally(() => process.exit(0));
  }

  process.stdin.once('end', shutDown);
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
}
