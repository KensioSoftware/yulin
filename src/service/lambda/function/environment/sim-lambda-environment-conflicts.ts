import type { SimLambdaEnvironment } from "./sim-lambda-environment.js";
import { simProcessEnvironment } from "../../../../util/process/sim-process-environment.js";

/**
 * The advice that follows each warning, given the name that was read early.
 */
function moveTheReadAdvice(name: string): string {
  return (
    `Code read process.env.${name} outside any invocation, as a read at ` +
    "module scope does when the module is imported, and saw the host value " +
    "instead. Move the read inside the handler function."
  );
}

/**
 * A difference between declared values that matters once the name is read
 * outside an invocation.
 */
interface SimLambdaEnvironmentConflict {
  readonly key: string;
  readonly name: string;
  readonly message: string;
}

/**
 * Warns about declared environment variables whose value a handler module
 * did not actually see.
 *
 * A sim Lambda function backed by a real in-process handler only gets its own
 * process.env while the handler runs, so a variable read at module scope is
 * read too early (see SimLambdaProcessEnv). That only changes what the code
 * sees when the value read at module scope differs from the declared one.
 * There are two ways for it to differ. The host process sets the same name
 * with a different value, or another simulated function declares the same
 * name with a different value.
 *
 * A difference is reported only once code has read the name from process.env
 * outside any invocation, which SimProcessEnvironment records. A difference
 * with no such read yet is held, and reported if the read turns up before a
 * later invocation (a handler module imported after the function was
 * created). A read made before Yulin was imported is not on record, and
 * leaves the difference unreported.
 *
 * Staying quiet when the values agree matters as much as warning when they do
 * not. Test suites commonly export the same variables they configure their
 * functions with, and in that case a module-scope read gets the right value
 * anyway and there is nothing to report.
 */
export class SimLambdaEnvironmentConflicts {
  /**
   * Conflict keys already reported, so repeated function creation does not
   * repeat the same warning.
   */
  private readonly warned = new Set<string>();

  /**
   * Conflicts found while their name had not been read outside an invocation.
   */
  private readonly held = new Map<string, SimLambdaEnvironmentConflict>();

  /**
   * Check a new function's environment against the host process and against
   * the functions that already exist.
   */
  check(
    environment: SimLambdaEnvironment,
    existingEnvironments: Iterable<SimLambdaEnvironment>,
  ): void {
    const existing = [...existingEnvironments];

    for (const [name, value] of environment.declaredVariables) {
      this.checkHostProcess(environment, name, value);
      this.checkOtherFunctions(environment, name, value, existing);
    }
  }

  /**
   * Report the held conflicts whose name has since been read outside an
   * invocation.
   *
   * Called as a function is invoked, before the handler runs.
   */
  reportReads(): void {
    for (const conflict of this.held.values()) {
      this.report(conflict);
    }
  }

  /**
   * Find a conflict when the host process sets the same name with a
   * different value.
   */
  private checkHostProcess(
    environment: SimLambdaEnvironment,
    name: string,
    value: string,
  ): void {
    // Read-only lookup of a name the function itself declared.
    // oxlint-disable-next-line security/detect-object-injection
    const hostValue = simProcessEnvironment.hostVariables()[name];
    if (hostValue === undefined || hostValue === value) {
      return;
    }

    this.report({
      key: `host:${name}`,
      name,
      message:
        `Sim Lambda function "${environment.functionName}" declares ` +
        `environment variable ${name}, which the host process also sets ` +
        `with a different value. ${moveTheReadAdvice(name)}`,
    });
  }

  /**
   * Find a conflict when another simulated function declares the same name
   * with a different value.
   */
  private checkOtherFunctions(
    environment: SimLambdaEnvironment,
    name: string,
    value: string,
    existingEnvironments: readonly SimLambdaEnvironment[],
  ): void {
    for (const existing of existingEnvironments) {
      const existingValue = existing.declaredVariables.get(name);
      if (existingValue === undefined || existingValue === value) {
        continue;
      }

      this.report({
        key: `function:${name}`,
        name,
        message:
          `Sim Lambda functions "${existing.functionName}" and ` +
          `"${environment.functionName}" declare different values for ` +
          `environment variable ${name}. ${moveTheReadAdvice(name)}`,
      });
      return;
    }
  }

  /**
   * Warn about a conflict once per key if its name has been read outside an
   * invocation, and hold it otherwise.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain; the simulator has no
   * logger of its own to route them through.
   */
  private report(conflict: SimLambdaEnvironmentConflict): void {
    if (this.warned.has(conflict.key)) {
      return;
    }
    if (!simProcessEnvironment.wasReadOutsideRun(conflict.name)) {
      if (!this.held.has(conflict.key)) {
        this.held.set(conflict.key, conflict);
      }
      return;
    }

    this.held.delete(conflict.key);
    this.warned.add(conflict.key);
    // oxlint-disable-next-line no-console
    console.warn(conflict.message);
  }
}
