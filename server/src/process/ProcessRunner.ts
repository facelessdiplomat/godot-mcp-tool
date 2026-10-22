import { execFile } from 'node:child_process';

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  readonly timeoutMs: number;
  readonly cwd?: string;
}

export interface ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult>;
}

const maximumOutputBytes = 16 * 1024 * 1024;

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        [...args],
        { timeout: options.timeoutMs, encoding: 'utf8', windowsHide: true, maxBuffer: maximumOutputBytes, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ exitCode: 0, stdout, stderr });
            return;
          }
          if (typeof error.code === 'number') {
            resolve({ exitCode: error.code, stdout, stderr });
            return;
          }
          if (error.killed === true) {
            reject(new Error(`${command} did not finish within ${String(options.timeoutMs)} ms`));
            return;
          }
          reject(new Error(`${command} could not be started: ${error.message}`, { cause: error }));
        },
      );
    });
  }
}
