import { SimWatchArguments } from "./sim-watch-arguments.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import { SimWatchSupervisor } from "./sim-watch-supervisor.js";

interface SimWatchCommandProperties {
  readonly cwd?: string;
  readonly reporter?: SimWatchReporter;
}

/**
 * The `yulin watch` command.
 *
 * Ctrl-C is handled here rather than left to the default, because the default
 * would take the supervisor down and leave the process it started running.
 */
export class SimWatchCommand {
  private readonly cwd: string;
  private readonly reporter: SimWatchReporter;

  constructor(properties: SimWatchCommandProperties = {}) {
    const { cwd = process.cwd(), reporter = new SimWatchReporter({ cwd }) } =
      properties;
    this.cwd = cwd;
    this.reporter = reporter;
  }

  /**
   * Run the command, and report the exit code it should leave behind.
   */
  async run(argv: readonly string[]): Promise<number> {
    const supervisor = new SimWatchSupervisor({
      watchArguments: SimWatchArguments.parse(argv),
      cwd: this.cwd,
      reporter: this.reporter,
    });

    const interrupt = (): void => {
      supervisor.interrupt();
    };

    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);

    try {
      return await supervisor.run();
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
  }
}
