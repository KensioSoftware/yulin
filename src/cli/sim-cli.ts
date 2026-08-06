import { SimWatchCommand } from "./watch/sim-watch-command.js";

const usage = `Usage: yulin <command>

Commands:
  watch [--inspect[=port]] -- <command>   Run a command, and run it again when project files change
`;

/**
 * Thrown for a command the CLI does not have.
 */
export class SimCliUnknownCommand extends Error {
  public override readonly name = "SimCliUnknownCommand";

  constructor(command: string) {
    super(`Unknown command ${command}.\n\n${usage}`);
  }
}

/**
 * The `yulin` command line.
 *
 * One command so far. It exists because a local dev loop needs a process
 * outside the one being restarted, which is not something a library can be.
 */
export class SimCli {
  /**
   * Run the CLI, and report the exit code it should leave behind.
   */
  async run(argv: readonly string[]): Promise<number> {
    const [command, ...rest] = argv;

    if (command === undefined) {
      process.stdout.write(usage);
      return 1;
    }

    if (["--help", "-h", "help"].includes(command)) {
      process.stdout.write(usage);
      return 0;
    }

    if (command !== "watch") {
      throw new SimCliUnknownCommand(command);
    }

    return await new SimWatchCommand().run(rest);
  }
}
