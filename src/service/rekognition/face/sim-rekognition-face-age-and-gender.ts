import type {
  SimRekognitionAgeRangeOutput,
  SimRekognitionGenderOutput,
} from "../command/detect-faces/detect-faces.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import { simRekognitionDeclaredGender } from "./sim-rekognition-declared-value.js";
import type {
  SimRekognitionDeclaredAgeRange,
  SimRekognitionDeclaredFace,
  SimRekognitionDeclaredGender,
} from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { SimRekognitionFaceMeasures } from "./sim-rekognition-face-measures.js";

/**
 * The two attributes describing the person rather than the picture: the age
 * range estimated for a declared face and the gender predicted for it.
 *
 * Both are estimates real Rekognition reports as such, and neither is filled
 * in when a declaration leaves it out.
 */
export class SimRekognitionFaceAgeAndGender {
  private readonly ageRange: SimRekognitionAgeRangeOutput | undefined;
  private readonly gender: SimRekognitionGenderOutput | undefined;

  constructor(
    private readonly subject: string,
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredFace,
  ) {
    this.ageRange = this.ageRangeOf(declared.ageRange);
    this.gender = this.genderOf(confidence, declared.gender);
  }

  /**
   * Add the age range and gender this face declared to a detail.
   */
  addTo(builder: SimRekognitionFaceDetailBuilder): void {
    builder
      .carry("AgeRange", "AGE_RANGE", this.ageRange)
      .carry("Gender", "GENDER", this.gender);
  }

  private ageRangeOf(
    declared: SimRekognitionDeclaredAgeRange | undefined,
  ): SimRekognitionAgeRangeOutput | undefined {
    if (declared === undefined) {
      return undefined;
    }

    const measures = new SimRekognitionFaceMeasures(this.subject);
    const range = {
      Low: measures.years("low", declared.low),
      High: measures.years("high", declared.high),
    };

    if (range.High < range.Low) {
      throw new SimRekognitionDeclarationError(
        `An age range declared for '${this.subject}' runs from ` +
          `${String(range.Low)} to ${String(range.High)}, which ends before ` +
          `it begins.`,
      );
    }

    return range;
  }

  private genderOf(
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredGender | undefined,
  ): SimRekognitionGenderOutput | undefined {
    if (declared === undefined) {
      return undefined;
    }

    const gender = simRekognitionDeclaredGender(declared);

    return {
      Value: this.genderValue(gender.value),
      Confidence: confidence.of(this.subject, gender.confidence),
    };
  }

  private genderValue(value: string): string {
    if (value === "Male" || value === "Female") {
      return value;
    }

    throw new SimRekognitionDeclarationError(
      `A gender of '${value}' declared for '${this.subject}' is not one ` +
        `real Rekognition predicts, which is 'Male' or 'Female'.`,
    );
  }
}
