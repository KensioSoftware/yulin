import type { SimLambdaEnvironment } from "./sim-lambda-environment.js";
import { simLambdaProcessEnvironment } from "./sim-lambda-process-environment.js";

const moveTheReadAdvice =
  "A read of process.env at module scope happens when the module is " +
  "imported, before any invocation, so it sees the host value instead. " +
  "Move the read inside the handler function.";

/**
 * Warns about declared environment variables whose value a handler module
 * might not actually see.
 *
 * A sim Lambda function backed by a real in-process handler only gets its own
 * process.env while the handler runs, so a variable read at module scope is
 * read too early (see SimLambdaProcessEnv). That only changes what the code
 * sees when the value read at module scope differs from the declared one, so
 * these are the two conditions worth reporting: the host process sets the
 * same name with a different value, or another simulated function declares
 * the same name with a different value.
 *
 * Staying quiet when the values agree matters as much as warning when they do
 * not. Test suites commonly export the same variables they configure their
 * functions with, and in that case a module-scope read gets the right value
 * anyway and there is nothing to report.
 */
export class SimLambdaEnvironmentConflicts {
  /**
   * Variable names already reported, so repeated function creation does not
   * repeat the same warning.
   */
  private readonly warned = new Set<string>();

  /**
   * Check a new function's environment against the host process and against
   * the functions that already exist.
   */
  check(
    environment: SimLambdaEnvironment,
    existingEnvironments: Iterable<SimLambdaEnvironment>,
  ): void {
    for (const [name, value] of environment.declaredVariables) {
      this.checkHostProcess(environment, name, value);
      this.checkOtherFunctions(environment, name, value, existingEnvironments);
    }
  }

  /**
   * Warn when the host process sets the same name with a different value.
   */
  private checkHostProcess(
    environment: SimLambdaEnvironment,
    name: string,
    value: string,
  ): void {
    // Read-only lookup of a name the function itself declared.
    // eslint-disable-next-line security/detect-object-injection
    const hostValue = simLambdaProcessEnvironment.hostVariables()[name];
    if (hostValue === undefined || hostValue === value) {
      return;
    }

    this.warn(
      `host:${name}`,
      `Sim Lambda function "${environment.functionName}" declares ` +
        `environment variable ${name}, which the host process also sets ` +
        `with a different value. ${moveTheReadAdvice}`,
    );
  }

  /**
   * Warn when another simulated function declares the same name with a
   * different value.
   */
  private checkOtherFunctions(
    environment: SimLambdaEnvironment,
    name: string,
    value: string,
    existingEnvironments: Iterable<SimLambdaEnvironment>,
  ): void {
    for (const existing of existingEnvironments) {
      const existingValue = existing.declaredVariables.get(name);
      if (existingValue === undefined || existingValue === value) {
        continue;
      }

      this.warn(
        `function:${name}`,
        `Sim Lambda functions "${existing.functionName}" and ` +
          `"${environment.functionName}" declare different values for ` +
          `environment variable ${name}. ${moveTheReadAdvice}`,
      );
      return;
    }
  }

  /**
   * Report a conflict once per variable name.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain; the simulator has no
   * logger of its own to route them through.
   */
  private warn(key: string, message: string): void {
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    // eslint-disable-next-line no-console
    console.warn(message);
  }
}
