const inspectorFlags = new Set([
  "--inspect",
  "--inspect-brk",
  "--inspect-wait",
]);

/**
 * Thrown when `yulin watch` was not given something to run.
 */
export class SimWatchUsageError extends Error {
  public override readonly name = "SimWatchUsageError";

  constructor(message: string) {
    super(`${message}\n\nUsage: yulin watch [--inspect[=port]] -- <command>`);
  }
}

/**
 * What `yulin watch` was asked to do.
 *
 * Everything after `--` is the command, passed through untouched. The CLI does
 * not import the command, look for an exported setup function, or care whether
 * the simulation it builds came from SDK commands, a template, or several
 * `SimAws` instances at once. It runs it and runs it again.
 */
export class SimWatchArguments {
  readonly command: string;
  readonly commandArguments: readonly string[];
  readonly inspect: string | undefined;

  private constructor(
    command: string,
    commandArguments: readonly string[],
    inspect: string | undefined,
  ) {
    this.command = command;
    this.commandArguments = commandArguments;
    this.inspect = inspect;
  }

  /**
   * Read the arguments given after `yulin watch`.
   */
  static parse(argv: readonly string[]): SimWatchArguments {
    const separator = argv.indexOf("--");

    if (separator === -1) {
      throw new SimWatchUsageError(
        "No command given. Put the command to run after --, so that its own options are not read as options to watch.",
      );
    }

    const [command, ...rest] = argv.slice(separator + 1);

    if (command === undefined) {
      throw new SimWatchUsageError("No command given after --.");
    }

    return new SimWatchArguments(
      command,
      rest,
      inspectorFlag(argv.slice(0, separator)),
    );
  }

  /**
   * The command as it was written, for reporting.
   */
  describe(): string {
    return [this.command, ...this.commandArguments].join(" ");
  }
}

/**
 * The inspector flag to pass through to each run, if one was asked for.
 */
function inspectorFlag(options: readonly string[]): string | undefined {
  const unknown = options.find((option) => !isInspectorFlag(option));

  if (unknown !== undefined) {
    throw new SimWatchUsageError(`Unknown option ${unknown}.`);
  }

  return options.at(-1);
}

function isInspectorFlag(option: string): boolean {
  const [flag = ""] = option.split("=");

  return inspectorFlags.has(flag);
}
