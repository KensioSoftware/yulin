import type { ChildProcess } from "node:child_process";
import {
  simWatchConfig,
  simWatchMessages,
} from "../../watch/sim-watch.config.js";
import { waitWatchMessage } from "./sim-watch-child-message.js";

interface SimWatchChildShutdownProperties {
  readonly process: ChildProcess;
  readonly finished: Promise<void>;
}

/**
 * Takes a supervised process down, in the order that lets it say goodbye.
 *
 * A process running Yulin's runtime is warned first, so a served page hears
 * that a reload is coming rather than only seeing its connection go, and is
 * killed as soon as it says it has passed that on. One that does not answer,
 * because it is serving nothing or is not a Yulin process at all, is killed
 * when the short wait runs out. Either way it is killed, and killed harder if
 * it will not go, because the port has to be free for the process replacing it.
 */
export class SimWatchChildShutdown {
  private readonly process: ChildProcess;
  private readonly finished: Promise<void>;

  constructor(properties: SimWatchChildShutdownProperties) {
    const { process: childProcess, finished } = properties;
    this.process = childProcess;
    this.finished = finished;
  }

  /**
   * Stop the process, and wait until it has gone.
   */
  async stop(): Promise<void> {
    await this.warn();
    this.process.kill("SIGTERM");
    await this.gone();
  }

  private async warn(): Promise<void> {
    if (!this.process.connected) {
      return;
    }

    const acknowledged = Promise.race([
      this.finished,
      waitWatchMessage(
        this.process,
        simWatchMessages.stopped,
        simWatchConfig.stoppingMs,
      ),
    ]);

    this.process.send({ type: simWatchMessages.stopping });

    await acknowledged;
  }

  private async gone(): Promise<void> {
    const timer = setTimeout(() => {
      this.process.kill("SIGKILL");
    }, simWatchConfig.exitMs);

    try {
      await this.finished;
    } finally {
      clearTimeout(timer);
    }
  }
}
