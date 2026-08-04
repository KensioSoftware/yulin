import { SimRekognitionInvalidParameterException } from "../error/sim-rekognition.error.js";

/**
 * The confidence one detection operation filters its results at.
 *
 * The default belongs to the operation rather than to the service: content
 * moderation filters at 50 and label detection at 55, so each operation makes
 * one of these with its own.
 */
export class SimRekognitionMinConfidence {
  constructor(private readonly whenUnset: number) {}

  /**
   * The minimum confidence a request filters at.
   *
   * The default is applied only when the request left it out, so an explicit
   * `0` asks for every result rather than being promoted to the default.
   */
  of(requested: number | undefined): number {
    if (requested === undefined) {
      return this.whenUnset;
    }

    // A NaN is refused here rather than compared against. Every comparison
    // with one is false, so it would filter every result out and look like an
    // image with nothing to report.
    if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: MinConfidence of ` +
          `${String(requested)} is not a percentage from 0 to 100`,
      );
    }

    return requested;
  }
}
