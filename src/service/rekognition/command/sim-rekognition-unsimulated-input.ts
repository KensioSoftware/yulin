import { SimRekognitionUnsimulatedInputException } from "../error/sim-rekognition.error.js";

/**
 * Refuses the request inputs this simulation does not model.
 *
 * The refusal works from the small set of options each command accepts rather
 * than from a list of everything Rekognition offers, so an option nobody
 * thought about is refused rather than dropped. Dropping is the failure mode
 * worth avoiding here: a request naming a custom moderation adapter through
 * `ProjectVersion` would be answered by the built-in model, which is the one
 * answer that looks right and is not.
 */
export class SimRekognitionUnsimulatedInput {
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

      throw new SimRekognitionUnsimulatedInputException(
        `${this.operation} ${option} is not simulated: it would be ignored ` +
          `here and applied on real AWS`,
      );
    }
  }
}
