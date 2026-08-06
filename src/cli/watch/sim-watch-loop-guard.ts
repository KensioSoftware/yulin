import { simWatchConfig } from "../../watch/sim-watch.config.js";

interface SimWatchLoopGuardProperties {
  readonly selfInflictedMs?: number;
  readonly loopRestarts?: number;
}

/**
 * Thrown when a process keeps restarting itself.
 */
export class SimWatchRestartLoop extends Error {
  public override readonly name = "SimWatchRestartLoop";

  constructor(changedPath: string, restarts: number) {
    super(
      `Restart loop: ${changedPath} changed straight after startup ${String(restarts)} times in a row. ` +
        `Something in the process writes to a watched path, so watching it restarts the process, which writes to it again. ` +
        `Write it outside the working directory, or to a directory watch ignores such as .tmp.`,
    );
  }
}

/**
 * Spots a process that restarts itself.
 *
 * Setup that writes into a watched path, such as synthesizing a template or
 * seeding a mounted Bucket directory, changes a file the supervisor is watching
 * as a direct result of having started. Left alone that restarts forever, at
 * whatever rate the setup takes, which looks like the machine being busy rather
 * than like a mistake. A change arriving before the process has been up long,
 * from the same path, several times in a row, is that and not a person typing.
 */
export class SimWatchLoopGuard {
  private readonly selfInflictedMs: number;
  private readonly loopRestarts: number;
  private lastPath: string | undefined;
  private consecutive = 0;

  constructor(properties: SimWatchLoopGuardProperties = {}) {
    const {
      selfInflictedMs = simWatchConfig.selfInflictedMs,
      loopRestarts = simWatchConfig.loopRestarts,
    } = properties;
    this.selfInflictedMs = selfInflictedMs;
    this.loopRestarts = loopRestarts;
  }

  /**
   * Note a restart, and refuse one that is the process restarting itself.
   */
  check(changedPath: string, processRanForMs: number): void {
    if (!this.selfInflicted(changedPath, processRanForMs)) {
      this.lastPath = changedPath;
      this.consecutive = 1;
      return;
    }

    this.consecutive += 1;

    if (this.consecutive >= this.loopRestarts) {
      throw new SimWatchRestartLoop(changedPath, this.consecutive);
    }
  }

  private selfInflicted(changedPath: string, processRanForMs: number): boolean {
    return (
      changedPath === this.lastPath && processRanForMs < this.selfInflictedMs
    );
  }
}
