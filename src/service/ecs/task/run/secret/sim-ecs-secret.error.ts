/**
 * A container secret that could not be turned into an environment variable.
 *
 * This never reaches an ECS caller. Real ECS resolves a task's secrets after
 * `RunTask` has answered, so the only place it can report one it could not read
 * is the stopped task, and that is what this becomes: the reason a task carries
 * when it failed to start.
 */
export class SimEcsSecretResolutionError extends Error {
  public override readonly name = "SimEcsSecretResolutionError";

  /**
   * What a failure says, for something a store threw that need not be an Error.
   *
   * A secret store is reached through its own service, so what comes back from
   * a failed read is whatever that service raises. Nothing here requires it to
   * be an Error, and a reason reading `[object Object]` would be worse than one
   * reading the value out.
   */
  static reasonFor(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
