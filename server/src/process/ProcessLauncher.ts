import { type ChildProcess, spawn } from 'node:child_process';

export interface LaunchedProcess {
  readonly hasExited: boolean;
  onOutput(listener: (text: string) => void): void;
  onExit(listener: (exitCode: number | null) => void): void;
  stop(): void;
}

export interface ProcessLauncher {
  launch(command: string, args: readonly string[], workingDirectory: string): LaunchedProcess;
}

const killGraceMs = 3_000;

export class NodeProcessLauncher implements ProcessLauncher {
  launch(command: string, args: readonly string[], workingDirectory: string): LaunchedProcess {
    return new NodeLaunchedProcess(spawn(command, [...args], { cwd: workingDirectory, stdio: ['ignore', 'pipe', 'pipe'] }), command);
  }
}

class NodeLaunchedProcess implements LaunchedProcess {
  private exited = false;
  private readonly outputListeners: ((text: string) => void)[] = [];
  private readonly exitListeners: ((exitCode: number | null) => void)[] = [];

  constructor(
    private readonly child: ChildProcess,
    command: string,
  ) {
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (text: string) => {
      this.emitOutput(text);
    });
    child.stderr?.on('data', (text: string) => {
      this.emitOutput(text);
    });
    child.once('error', (error) => {
      this.emitOutput(`Could not start ${command}: ${error.message}\n`);
      this.finish(null);
    });
    child.once('close', (exitCode) => {
      this.finish(exitCode);
    });
  }

  get hasExited(): boolean {
    return this.exited;
  }

  onOutput(listener: (text: string) => void): void {
    this.outputListeners.push(listener);
  }

  onExit(listener: (exitCode: number | null) => void): void {
    this.exitListeners.push(listener);
  }

  stop(): void {
    if (this.exited) {
      return;
    }
    this.child.kill('SIGTERM');
    setTimeout(() => {
      if (!this.exited) {
        this.child.kill('SIGKILL');
      }
    }, killGraceMs).unref();
  }

  private emitOutput(text: string): void {
    for (const listener of this.outputListeners) {
      listener(text);
    }
  }

  private finish(exitCode: number | null): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    for (const listener of this.exitListeners) {
      listener(exitCode);
    }
  }
}
