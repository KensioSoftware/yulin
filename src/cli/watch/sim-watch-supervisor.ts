import type { SimWatchArguments } from "./sim-watch-arguments.js";
import { SimWatchChild } from "./sim-watch-child.js";
import { SimWatchChildEnvironment } from "./sim-watch-child-environment.js";
import { SimWatchLoopGuard } from "./sim-watch-loop-guard.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import { SimWatchRestarts } from "./sim-watch-restarts.js";
import { SimWatchWatcher } from "./sim-watch-watcher.js";

interface SimWatchSupervisorProperties {
  readonly watchArguments: SimWatchArguments;
  readonly cwd?: string;
  readonly reporter?: SimWatchReporter;
}

/**
 * Runs a command, and runs it again when something changes.
 *
 * The supervisor is a separate process from the one being restarted, and has to
 * be. A process that respawned itself would leave the shell's job pointing at
 * the process that exited, so the prompt would come back while an orphan held
 * the terminal, and Ctrl-C would stop meaning anything.
 */
export class SimWatchSupervisor {
  private readonly watchArguments: SimWatchArguments;
  private readonly cwd: string;
  private readonly reporter: SimWatchReporter;
  private readonly watcher: SimWatchWatcher;
  private readonly restarts: SimWatchRestarts;
  private readonly loopGuard = new SimWatchLoopGuard();
  private child: SimWatchChild | undefined;
  private stop: ((exitCode: number) => void) | undefined;

  private readonly onReportedPath = (reportedPath: string): void => {
    this.watcher.addReported(reportedPath);
  };

  /**
   * A path the process watches itself, such as a deployed template it updates
   * the Stack from in place. Restarting for it would throw away the simulated
   * state the in-place update exists to keep.
   */
  private readonly onHeldPath = (heldPath: string): void => {
    this.watcher.addHeld(heldPath);
  };

  /**
   * A process that stopped on its own is a setup that threw, or a script that
   * ran to the end. Either way the watching goes on, so the next save tries
   * again without the watch having to be started over.
   */
  private readonly onChildExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    this.watcher.clearHeld();
    this.reporter.exited(code, signal);
  };

  constructor(properties: SimWatchSupervisorProperties) {
    const {
      watchArguments,
      cwd = process.cwd(),
      reporter = new SimWatchReporter({ cwd }),
    } = properties;
    this.watchArguments = watchArguments;
    this.cwd = cwd;
    this.reporter = reporter;
    this.restarts = new SimWatchRestarts({
      restart: async (changedPath: string): Promise<void> => {
        await this.restart(changedPath);
      },
      onFailure: (error: unknown): void => {
        this.fail(error);
      },
    });
    this.watcher = new SimWatchWatcher({
      cwd,
      settleMs: watchArguments.settleMs,
      onChange: (changedPath: string): void => {
        this.restarts.request(changedPath);
      },
    });
  }

  /**
   * Watch until something stops the watching, and report how it ended.
   */
  async run(): Promise<number> {
    this.reporter.started(this.watchArguments.describe());
    this.watcher.start();

    // Taken before the first start, so an interrupt during startup is heard,
    // and released in `finally`, so a command that could not be run at all
    // leaves nothing watching. Open watchers would keep the process alive after
    // the error had been reported, which reads as a hang rather than a mistake.
    const stopped = new Promise<number>((resolve) => {
      this.stop = resolve;
    });

    try {
      await this.start();

      return await stopped;
    } finally {
      this.watcher.stop();
      await this.child?.stop();
    }
  }

  /**
   * Stop watching, for a supervisor that has been interrupted.
   */
  interrupt(): void {
    this.stop?.(0);
  }

  private async start(): Promise<void> {
    // The run that held a path has gone, and the one replacing it says what it
    // holds as it registers it. Keeping the old list would leave a file the new
    // run is not watching neither restarted for nor answered in place.
    this.watcher.clearHeld();

    const child = new SimWatchChild({
      command: this.watchArguments.command,
      args: this.watchArguments.commandArguments,
      cwd: this.cwd,
      env: new SimWatchChildEnvironment({
        cwd: this.cwd,
        inspect: this.watchArguments.inspect,
      }).build(),
      onPath: this.onReportedPath,
      onHeldPath: this.onHeldPath,
      onExit: this.onChildExit,
    });

    // Kept only once it is running. A command that could not be run has no
    // process to stop, and waiting for one to exit that never started is a wait
    // that never ends.
    await child.started();
    this.child = child;
  }

  private async restart(changedPath: string): Promise<void> {
    const startedAt = Date.now();
    this.loopGuard.check(changedPath, this.child?.ranForMs() ?? 0);

    await this.child?.stop();
    await this.start();

    this.reporter.restarted(changedPath, Date.now() - startedAt);
  }

  private fail(error: unknown): void {
    this.reporter.failed(
      error instanceof Error ? error : new Error(String(error)),
    );
    this.stop?.(1);
  }
}
