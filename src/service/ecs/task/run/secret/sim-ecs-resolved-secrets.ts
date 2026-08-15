import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * What a task's containers run with once their `secrets` have been resolved,
 * or why the task cannot start.
 *
 * Every container of a task is resolved before any of them runs, because that
 * is when a real task agent pulls them: a secret nobody can read stops the
 * task rather than stopping the container that declared it, so an earlier
 * container never runs on a task that was never going to work.
 */
export class SimEcsResolvedSecrets {
  readonly #byContainer: ReadonlyMap<string, Record<string, string>>;
  readonly #failureReason: string | undefined;

  private constructor(
    byContainer: ReadonlyMap<string, Record<string, string>>,
    failureReason: string | undefined,
  ) {
    this.#byContainer = byContainer;
    this.#failureReason = failureReason;
  }

  /**
   * Every container's secrets, read as the task execution Role.
   */
  static resolved(
    byContainer: ReadonlyMap<string, Record<string, string>>,
  ): SimEcsResolvedSecrets {
    return new SimEcsResolvedSecrets(byContainer, undefined);
  }

  /**
   * A task that cannot start, because one of its secrets could not be read.
   */
  static failed(reason: string): SimEcsResolvedSecrets {
    return new SimEcsResolvedSecrets(new Map(), reason);
  }

  /**
   * Whether the task's containers can go on to run.
   */
  get isResolved(): boolean {
    return this.#failureReason === undefined;
  }

  /**
   * Why the task failed to start, in the terms real ECS reports it.
   */
  get failureReason(): string {
    if (this.#failureReason === undefined) {
      throw new SimEcsSecretResolutionError(
        "These secrets resolved, so there is no failure reason to report.",
      );
    }

    return this.#failureReason;
  }

  /**
   * The variables one container's secrets set, which may be none.
   */
  forContainer(containerName: string): Record<string, string> {
    return this.#byContainer.get(containerName) ?? {};
  }
}
