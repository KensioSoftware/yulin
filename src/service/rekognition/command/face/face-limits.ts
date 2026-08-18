import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";

interface SimRekognitionFaceLimitProperties {
  readonly most?: number;
}

/**
 * A limit on the number of faces one request works with.
 *
 * There is no default. A request that left `MaxFaces` out gets every face, as
 * it does on AWS, so an operation only has to say what the largest limit it
 * accepts is. `SearchFacesByImage` has one and `IndexFaces` has none.
 */
export class SimRekognitionFaceLimit {
  private readonly most: number | undefined;

  constructor(properties: SimRekognitionFaceLimitProperties = {}) {
    this.most = properties.most;
  }

  /**
   * The limit a request asked for, if it asked for one.
   */
  of(requested: number | undefined): number | undefined {
    if (requested === undefined) {
      return undefined;
    }

    if (
      !Number.isSafeInteger(requested) ||
      requested < 1 ||
      this.exceeded(requested)
    ) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: MaxFaces of ${String(requested)} ` +
          `is not a whole number of faces from 1 ${this.upperBound()}`,
      );
    }

    return requested;
  }

  private exceeded(requested: number): boolean {
    return this.most !== undefined && requested > this.most;
  }

  private upperBound(): string {
    return this.most === undefined ? "upwards" : `to ${String(this.most)}`;
  }
}
