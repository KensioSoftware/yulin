import type {
  SimRekognitionBoundingBoxOutput,
  SimRekognitionLabelInstanceOutput,
} from "../command/detect-labels/detect-labels.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import type {
  SimRekognitionDeclaredBoundingBox,
  SimRekognitionDeclaredLabelInstance,
} from "./sim-rekognition-label-declaration.js";

/**
 * The instances of one declared label, resolved into what a response carries.
 *
 * An instance takes its label's confidence when none is declared for it, since
 * a label detected at 98 is not usually located at 40. Bounding box values go
 * through `Math.fround` for the same reason confidences do: real ones are
 * float32 values such as `0.26779675483703613`.
 */
export class SimRekognitionLabelInstances {
  private readonly confidence: SimRekognitionDeclaredConfidence;

  constructor(
    private readonly labelName: string,
    labelConfidence: number,
  ) {
    this.confidence = new SimRekognitionDeclaredConfidence(labelConfidence);
  }

  /**
   * Resolve the declared instances of this label.
   */
  resolve(
    declared: readonly SimRekognitionDeclaredLabelInstance[],
  ): readonly SimRekognitionLabelInstanceOutput[] {
    return declared.map((instance) => ({
      BoundingBox: this.boundingBox(instance.boundingBox),
      Confidence: this.confidence.of(this.labelName, instance.confidence),
    }));
  }

  private boundingBox(
    box: SimRekognitionDeclaredBoundingBox,
  ): SimRekognitionBoundingBoxOutput {
    return {
      Left: this.ratio("left", box.left),
      Top: this.ratio("top", box.top),
      Width: this.ratio("width", box.width),
      Height: this.ratio("height", box.height),
    };
  }

  private ratio(part: string, value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new SimRekognitionDeclarationError(
        `A bounding box declared for '${this.labelName}' has a ${part} of ` +
          `${String(value)}, which is not a ratio of the image size from 0 ` +
          `to 1.`,
      );
    }

    return Math.fround(value);
  }
}
