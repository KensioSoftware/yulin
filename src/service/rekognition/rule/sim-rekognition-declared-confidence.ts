import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";

/**
 * The confidence a declared result reports a label at.
 *
 * Every operation group declares confidences the same way and defaults them
 * differently, so the range check lives here and the default is passed in.
 *
 * Confidences pass through `Math.fround`. Real Rekognition confidences are
 * float32 values with a long tail, such as `99.44782257080078`, and a value
 * rounded to four decimals is identifiable as fake.
 */
export class SimRekognitionDeclaredConfidence {
  constructor(private readonly whenUndeclared: number) {}

  /**
   * The confidence to report a declared label at.
   *
   * The label name is only used to say which declaration was wrong.
   */
  of(name: string, declared: number | undefined): number {
    const confidence = declared ?? this.whenUndeclared;

    // A NaN is refused with everything else out of range. Every comparison
    // with one is false, so a label declared at NaN would never survive
    // MinConfidence filtering and would look like a rule that never matched.
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new SimRekognitionDeclarationError(
        `A confidence of ${String(confidence)} declared for '${name}' is not ` +
          `a Rekognition confidence, which is a percentage from 0 to 100.`,
      );
    }

    return Math.fround(confidence);
  }
}
