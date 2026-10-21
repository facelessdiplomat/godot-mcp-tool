#!/usr/bin/env node
import { homedir } from 'node:os';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApplication } from './createApplication.js';

const application = createApplication({
  variables: process.env,
  workingDirectory: process.cwd(),
  platform: process.platform,
  homeDirectory: homedir(),
});

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
