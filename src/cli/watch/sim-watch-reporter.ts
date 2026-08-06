import path from "node:path";

interface SimWatchReporterProperties {
  readonly write?: (line: string) => void;
  readonly cwd?: string;
}

/**
 * What `yulin watch` says in the terminal.
 *
 * It writes to standard error so the supervised process keeps standard output
 * to itself, which matters when that output is being piped somewhere. Paths are
 * reported relative to the working directory, since an absolute path in a
 * restart line is mostly the part that has not changed.
 */
export class SimWatchReporter {
  private readonly write: (line: string) => void;
  private readonly cwd: string;

  constructor(properties: SimWatchReporterProperties = {}) {
    const {
      write = (line: string): void => {
        process.stderr.write(line);
      },
      cwd = process.cwd(),
    } = properties;
    this.write = write;
    this.cwd = cwd;
  }

  /**
   * Report the first start, so it is clear the supervisor is there.
   */
  started(command: string): void {
    this.line(`watching ${this.relative(this.cwd)}, running ${command}`);
  }

  /**
   * Report a restart, and what it cost.
   */
  restarted(changedPath: string, tookMs: number): void {
    this.line(
      `restarted in ${String(Math.round(tookMs))}ms after ${this.relative(changedPath)}`,
    );
  }

  /**
   * Report a process that stopped on its own, which is a setup error rather
   * than a reason to stop watching.
   */
  exited(code: number | null, signal: NodeJS.Signals | null): void {
    this.line(
      `process exited (${describeExit(code, signal)}), waiting for a change`,
    );
  }

  /**
   * Report something that stops the watcher.
   */
  failed(error: Error): void {
    this.line(error.message);
  }

  private line(message: string): void {
    this.write(`yulin watch: ${message}\n`);
  }

  private relative(target: string): string {
    const relative = path.relative(this.cwd, target);

    if (relative.length === 0) {
      return ".";
    }

    if (relative.startsWith("..")) {
      return target;
    }

    return relative;
  }
}

function describeExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal !== null) {
    return signal;
  }

  return `code ${String(code ?? 0)}`;
}
