const inspectorFlags = new Set([
  "--inspect",
  "--inspect-brk",
  "--inspect-wait",
]);
const settleFlag = "--settle";

/**
 * Thrown when `yulin watch` was not given something to run.
 */
export class SimWatchUsageError extends Error {
  public override readonly name = "SimWatchUsageError";

  constructor(message: string) {
    super(
      `${message}\n\nUsage: yulin watch [--inspect[=port]] [--settle=ms] -- <command>`,
    );
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
  readonly settleMs: number | undefined;

  private constructor(
    command: string,
    commandArguments: readonly string[],
    options: SimWatchOptions,
  ) {
    this.command = command;
    this.commandArguments = commandArguments;
    this.inspect = options.inspect;
    this.settleMs = options.settleMs;
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
      optionsIn(argv.slice(0, separator)),
    );
  }

  /**
   * The command as it was written, for reporting.
   */
  describe(): string {
    return [this.command, ...this.commandArguments].join(" ");
  }
}

interface SimWatchOptions {
  readonly inspect: string | undefined;
  readonly settleMs: number | undefined;
}

/**
 * The options written before the separator, which are the only ones watch reads
 * itself.
 */
function optionsIn(given: readonly string[]): SimWatchOptions {
  let inspect: string | undefined;
  let settleMs: number | undefined;

  for (const option of given) {
    const flag = flagOf(option);

    if (inspectorFlags.has(flag)) {
      inspect = option;
    } else if (flag === settleFlag) {
      settleMs = settleValue(option);
    } else {
      throw new SimWatchUsageError(`Unknown option ${option}.`);
    }
  }

  return { inspect, settleMs };
}

/**
 * How long a burst of writes has to go quiet, for a project whose build the
 * default window does not suit.
 */
function settleValue(option: string): number {
  const [, value] = option.split("=", 2);
  const milliseconds = Number(value);

  if (
    value === undefined ||
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1
  ) {
    throw new SimWatchUsageError(
      `${settleFlag} takes a number of milliseconds, written as ${settleFlag}=250.`,
    );
  }

  return milliseconds;
}

function flagOf(option: string): string {
  const [flag = ""] = option.split("=", 1);

  return flag;
}
