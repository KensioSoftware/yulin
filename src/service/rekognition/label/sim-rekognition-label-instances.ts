import type { SimRekognitionLabelInstanceOutput } from "../command/detect-labels/detect-labels.command.js";
import { SimRekognitionBoundingBoxes } from "../image/sim-rekognition-bounding-box.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import type { SimRekognitionDeclaredLabelInstance } from "./sim-rekognition-label-declaration.js";

/**
 * The instances of one declared label, resolved into what a response carries.
 *
 * An instance takes its label's confidence when none is declared for it, since
 * a label detected at 98 is not usually located at 40.
 */
export class SimRekognitionLabelInstances {
  private readonly confidence: SimRekognitionDeclaredConfidence;
  private readonly boundingBoxes: SimRekognitionBoundingBoxes;

  constructor(
    private readonly labelName: string,
    labelConfidence: number,
  ) {
    this.confidence = new SimRekognitionDeclaredConfidence(labelConfidence);
    this.boundingBoxes = new SimRekognitionBoundingBoxes(labelName);
  }

  /**
   * Resolve the declared instances of this label.
   */
  resolve(
    declared: readonly SimRekognitionDeclaredLabelInstance[],
  ): readonly SimRekognitionLabelInstanceOutput[] {
    return declared.map((instance) => ({
      BoundingBox: this.boundingBoxes.of(instance.boundingBox),
      Confidence: this.confidence.of(this.labelName, instance.confidence),
    }));
  }
}
