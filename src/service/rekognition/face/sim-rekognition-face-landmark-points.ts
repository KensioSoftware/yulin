import type { SimRekognitionLandmarkOutput } from "../command/detect-faces/detect-faces.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type {
  SimRekognitionDeclaredLandmarks,
  SimRekognitionDeclaredPoint,
} from "./sim-rekognition-face-declaration.js";
import {
  isSimRekognitionLandmarkName,
  simRekognitionLandmarkNames,
  type SimRekognitionLandmarkName,
} from "./sim-rekognition-landmark-name.js";

/**
 * The landmark pairs a face reports in a fixed order across the image.
 *
 * Rekognition reports the first of each pair at the smaller X. A declaration
 * with them the other way round has the two swapped, which is worth refusing
 * where it was written: a test asserting that the left eye is on the left
 * would pass here and fail on AWS.
 */
const acrossTheFace: readonly (readonly [
  SimRekognitionLandmarkName,
  SimRekognitionLandmarkName,
])[] = [
  ["eyeLeft", "eyeRight"],
  ["mouthLeft", "mouthRight"],
  ["noseLeft", "noseRight"],
];

/**
 * The landmarks declared for one face, resolved into what a response carries.
 *
 * They are resolved in the order real Rekognition reports them in rather than
 * the order they were declared in, and they are not required to sit inside the
 * bounding box, because a real Rekognition face box routinely excludes the
 * chin.
 */
export class SimRekognitionFaceLandmarkPoints {
  constructor(
    private readonly subject: string,
    private readonly declared: SimRekognitionDeclaredLandmarks,
  ) {}

  /**
   * The declared landmarks, checked and in reporting order.
   */
  resolve(): readonly SimRekognitionLandmarkOutput[] {
    this.refuseUnknown();
    this.refuseSwapped();

    return simRekognitionLandmarkNames.flatMap((name) => this.landmarkOf(name));
  }

  private landmarkOf(
    name: SimRekognitionLandmarkName,
  ): readonly SimRekognitionLandmarkOutput[] {
    // eslint-disable-next-line security/detect-object-injection -- one of the landmark names this file lists.
    const point = this.declared[name];

    if (point === undefined) {
      return [];
    }

    return [
      {
        Type: name,
        X: this.ratio(name, "x", point.x),
        Y: this.ratio(name, "y", point.y),
      },
    ];
  }

  private ratio(
    name: SimRekognitionLandmarkName,
    axis: string,
    value: number,
  ): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new SimRekognitionDeclarationError(
        `The '${name}' landmark declared for '${this.subject}' has an ` +
          `${axis} of ${String(value)}, which is not a ratio of the image ` +
          `size from 0 to 1.`,
      );
    }

    return Math.fround(value);
  }

  private refuseUnknown(): void {
    for (const name of Object.keys(this.declared)) {
      if (isSimRekognitionLandmarkName(name)) {
        continue;
      }

      throw new SimRekognitionDeclarationError(
        `'${name}' declared for '${this.subject}' is not a landmark ` +
          `Rekognition reports.`,
      );
    }
  }

  private refuseSwapped(): void {
    for (const [left, right] of acrossTheFace) {
      // eslint-disable-next-line security/detect-object-injection -- the landmark names of one pair listed above.
      this.refusePair(left, right, this.declared[left], this.declared[right]);
    }
  }

  private refusePair(
    left: SimRekognitionLandmarkName,
    right: SimRekognitionLandmarkName,
    leftPoint: SimRekognitionDeclaredPoint | undefined,
    rightPoint: SimRekognitionDeclaredPoint | undefined,
  ): void {
    if (leftPoint === undefined || rightPoint === undefined) {
      return;
    }

    if (leftPoint.x < rightPoint.x) {
      return;
    }

    throw new SimRekognitionDeclarationError(
      `The '${left}' landmark declared for '${this.subject}' is at an x of ` +
        `${String(leftPoint.x)} and '${right}' is at ${String(rightPoint.x)}. ` +
        `Real Rekognition reports '${left}' at the smaller x, so these two ` +
        `look swapped.`,
    );
  }
}
