import { simProcessEnvironment } from "../../../../util/process/sim-process-environment.js";

/**
 * The environment of a function that declares no variables of its own.
 *
 * It is the host process environment with the AWS-provided runtime variables
 * laid over it. The host variables are read for each invocation rather than
 * merged once, so a variable the test process sets between two invocations
 * reaches the second of them.
 *
 * What the handler itself wrote is kept and laid over both, which is the warm
 * execution environment semantics a function declaring variables gets from
 * reusing one object. A name the handler wrote and the host also sets is the
 * handler's, until the function is replaced.
 */
export class SimLambdaHostBackedVariables {
  private readonly written = new Map<string, string>();

  /**
   * Run function code with these variables as its process.env.
   */
  async runWith<T>(
    functionVariables: Record<string, string>,
    run: () => Promise<T>,
  ): Promise<T> {
    const merged = {
      ...simProcessEnvironment.definedHostVariables(),
      ...functionVariables,
      ...Object.fromEntries(this.written),
    };
    const variables = { ...merged };

    try {
      return await simProcessEnvironment.run(variables, run);
    } finally {
      this.recordWrites(merged, variables);
    }
  }

  /**
   * Keep what the handler wrote for the next invocation.
   *
   * A name the handler removed is left out. The next invocation reads it from
   * the host process again, the way a name it never touched is read.
   */
  private recordWrites(
    merged: Record<string, string>,
    variables: Record<string, string>,
  ): void {
    const before = new Map(Object.entries(merged));

    for (const [name, value] of Object.entries(variables)) {
      if (before.get(name) !== value) {
        this.written.set(name, value);
      }
    }
  }
}
