import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";

/**
 * The ranges the numbers declared for a face have to sit in.
 *
 * Pose, eye direction, quality and age all carry plain numbers with a meaning
 * of their own, so each is checked against the range real Rekognition reports
 * it in and refused where it was declared.
 *
 * Angles and percentages go through `Math.fround`, as confidences do: real
 * Rekognition reports them as float32 values such as `-5.83309268951416`.
 */
export class SimRekognitionFaceMeasures {
  constructor(private readonly subject: string) {}

  /**
   * An angle in degrees.
   */
  angle(part: string, value: number): number {
    if (!Number.isFinite(value) || value < -180 || value > 180) {
      throw new SimRekognitionDeclarationError(
        `A ${part} declared for '${this.subject}' is ${String(value)}, which ` +
          `is not an angle in degrees from -180 to 180.`,
      );
    }

    return Math.fround(value);
  }

  /**
   * A measure Rekognition reports from 0 to 100.
   */
  percentage(part: string, value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new SimRekognitionDeclarationError(
        `A ${part} declared for '${this.subject}' is ${String(value)}, which ` +
          `is not a measure from 0 to 100.`,
      );
    }

    return Math.fround(value);
  }

  /**
   * A whole number of years.
   */
  years(part: string, value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SimRekognitionDeclarationError(
        `An age declared for '${this.subject}' has a ${part} of ` +
          `${String(value)}, which is not a whole number of years from 0 ` +
          `upwards.`,
      );
    }

    return value;
  }
}
