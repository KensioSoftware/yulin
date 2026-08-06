import { simWatchMessages } from "../../watch/sim-watch.config.js";
import { isWatchPathMessage } from "./sim-watch-child-message.js";
import { SimWatchChildProcess } from "./sim-watch-child-process.js";
import { SimWatchChildShutdown } from "./sim-watch-child-shutdown.js";

interface SimWatchChildProperties {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onPath: (reportedPath: string) => void;
  readonly onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

/**
 * One run of the supervised command.
 *
 * A restart is a new instance of this rather than anything swapped in place. A
 * handler is a function reference out of the user's own module graph, and a new
 * process re-imports it with no module cache to defeat, so a restart is correct
 * by construction where an in-process swap would have to invalidate an import
 * graph that ESM does not expose.
 */
export class SimWatchChild {
  private readonly properties: SimWatchChildProperties;
  private readonly run: SimWatchChildProcess;
  private readonly startedAt = Date.now();
  private stopping = false;

  private readonly onMessage = (message: unknown): void => {
    if (isWatchPathMessage(message, simWatchMessages.path)) {
      this.properties.onPath(message.path);
    }
  };

  private readonly onProcessExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    if (!this.stopping) {
      this.properties.onExit(code, signal);
    }
  };

  constructor(properties: SimWatchChildProperties) {
    this.properties = properties;
    this.run = new SimWatchChildProcess(properties);

    this.run.process.on("message", this.onMessage);
    this.run.process.on("exit", this.onProcessExit);
  }

  /**
   * How long this process has been running.
   */
  ranForMs(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * Fail if the command could not be run at all, rather than letting it look
   * like a process that started and stopped.
   */
  async started(): Promise<void> {
    await this.run.spawned;
  }

  /**
   * Stop this process, giving it a moment to tell its browsers first.
   */
  async stop(): Promise<void> {
    this.stopping = true;

    await new SimWatchChildShutdown({
      process: this.run.process,
      finished: this.run.finished,
    }).stop();
  }
}
