import type { LaunchedProcess, ProcessLauncher } from '../../src/process/ProcessLauncher.js';

export class FakeProcess implements LaunchedProcess {
  hasExited = false;
  stopRequests = 0;
  private readonly outputListeners: ((text: string) => void)[] = [];
  private readonly exitListeners: ((exitCode: number | null) => void)[] = [];

  onOutput(listener: (text: string) => void): void {
    this.outputListeners.push(listener);
  }

  onExit(listener: (exitCode: number | null) => void): void {
    this.exitListeners.push(listener);
  }

  emitOutput(text: string): void {
    for (const listener of this.outputListeners) {
      listener(text);
    }
  }

  exit(exitCode: number | null): void {
    if (this.hasExited) {
      return;
    }
    this.hasExited = true;
    for (const listener of this.exitListeners) {
      listener(exitCode);
    }
  }

  stop(): void {
    this.stopRequests += 1;
    this.exit(null);
  }
}

export interface LaunchCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
}

export class FakeProcessLauncher implements ProcessLauncher {
  readonly calls: LaunchCall[] = [];
  readonly processes: FakeProcess[] = [];
  simulate: (process: FakeProcess, args: readonly string[]) => void = () => undefined;

  launch(command: string, args: readonly string[], workingDirectory: string): LaunchedProcess {
    const process = new FakeProcess();
    this.calls.push({ command, args, workingDirectory });
    this.processes.push(process);
    setTimeout(() => {
      this.simulate(process, args);
    }, 0);
    return process;
  }
}
