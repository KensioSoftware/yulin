import { SimEcsClientException } from "../error/sim-ecs.error.js";

/**
 * Refuses the request inputs this simulation does not hold.
 *
 * The refusal works from the small set of options each command accepts rather
 * than from a list of everything ECS offers, so an option nobody thought about
 * is refused rather than dropped. Dropping is the failure mode worth avoiding:
 * a registration is a declaration, and a declaration silently missing from the
 * revision it made is a test passing on state that is not what was asked for.
 */
export class SimEcsUnsimulatedInput {
  private readonly operation: string;

  constructor(operation: string) {
    this.operation = operation;
  }

  /**
   * Refuse every supplied input that is not one of the accepted options.
   */
  refuseUnaccepted(input: object, accepted: readonly string[]): void {
    for (const [option, value] of Object.entries(input)) {
      if (value === undefined || accepted.includes(option)) {
        continue;
      }

      throw new SimEcsClientException(
        `${this.operation} ${option} is not simulated: it would be dropped ` +
          `here and applied on real AWS`,
      );
    }
  }
}
