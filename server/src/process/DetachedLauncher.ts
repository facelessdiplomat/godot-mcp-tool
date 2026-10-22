import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';

export interface DetachedProcess {
  readonly pid: number | undefined;
  readonly endReason: string | undefined;
}

export interface DetachedLauncher {
  start(command: string, args: readonly string[], logPath: string): DetachedProcess;
}

export class NodeDetachedLauncher implements DetachedLauncher {
  start(command: string, args: readonly string[], logPath: string): DetachedProcess {
    const log = openSync(logPath, 'w');
    try {
      const child = spawn(command, [...args], { detached: true, stdio: ['ignore', log, log], windowsHide: false });
      const watched = new WatchedProcess(child);
      child.unref();
      return watched;
    } finally {
      closeSync(log);
    }
  }
}

class WatchedProcess implements DetachedProcess {
  private ending: string | undefined;

  constructor(private readonly child: ChildProcess) {
    child.once('exit', (exitCode, signal) => {
      this.ending ??= exitCode === null ? `signal ${String(signal)}` : `exit code ${String(exitCode)}`;
    });
    child.once('error', (error) => {
      this.ending ??= `could not start: ${error.message}`;
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get endReason(): string | undefined {
    return this.ending;
  }
}
