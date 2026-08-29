import {
  makeSimCfInvalidationId,
  type SimCfInvalidation,
  type SimCfInvalidationId,
} from "./sim-cf-invalidation.js";

/**
 * The invalidations one simulated Distribution has been asked for.
 *
 * An invalidation is scoped to its Distribution, so this hangs off the
 * Distribution rather than off the service. It holds them in the order they
 * were created, which is the order the counts and the listing are read back
 * from.
 */
export class SimCfInvalidations {
  private readonly invalidations: SimCfInvalidation[] = [];

  /**
   * Allocate an invalidation ID no invalidation of this Distribution holds.
   */
  allocateInvalidationId(): SimCfInvalidationId {
    let invalidationId = makeSimCfInvalidationId();

    while (this.byId(invalidationId) !== undefined) {
      /* v8 ignore next -- does not happen in practice */
      invalidationId = makeSimCfInvalidationId();
    }

    return invalidationId;
  }

  /**
   * Hold on to an invalidation.
   */
  add(invalidation: SimCfInvalidation): void {
    this.invalidations.push(invalidation);
  }

  /**
   * Get an invalidation by ID.
   */
  byId(
    invalidationId: SimCfInvalidationId | string,
  ): SimCfInvalidation | undefined {
    return this.invalidations.find(
      (invalidation) => invalidation.invalidationId === invalidationId,
    );
  }

  /**
   * Get the invalidation created under a `CallerReference`, if there is one.
   *
   * A `CallerReference` is what makes a batch idempotent, so this is what a
   * repeated one is answered from.
   */
  byCallerReference(callerReference: string): SimCfInvalidation | undefined {
    return this.invalidations.find(
      (invalidation) => invalidation.callerReference === callerReference,
    );
  }

  /**
   * The invalidations of this Distribution, most recently created first, as
   * CloudFront lists them.
   */
  newestFirst(): readonly SimCfInvalidation[] {
    return this.invalidations.toReversed();
  }

  /**
   * How many invalidations of this Distribution are still running, which is
   * what GetDistribution reports as `InProgressInvalidationBatches`.
   */
  get inProgressCount(): number {
    return this.invalidations.filter(
      (invalidation) => invalidation.status === "InProgress",
    ).length;
  }
}
