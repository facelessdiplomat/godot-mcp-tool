#!/usr/bin/env node
import { homedir } from 'node:os';
import { text } from 'node:stream/consumers';
import { parseCommandLine } from './cli/CommandLine.js';
import { runCommand } from './cli/runCommand.js';
import { bundledAddonDirectory } from './packageFiles.js';
import { serveOverStdio } from './serveOverStdio.js';

const environment = {
  variables: process.env,
  workingDirectory: process.cwd(),
  platform: process.platform,
  homeDirectory: homedir(),
};

const request = parseCommandLine(process.argv.slice(2));

if (request.kind === 'serve') {
  serveOverStdio(environment);
} else {
  process.exitCode = await runCommand(
    request,
    { ...environment, nodeVersion: process.versions.node, bundledAddonDirectory, readInput: () => text(process.stdin) },
    {
      write: (line) => {
        process.stdout.write(`${line}\n`);
      },
      writeError: (line) => {
        process.stderr.write(`${line}\n`);
      },
    },
  );
}
