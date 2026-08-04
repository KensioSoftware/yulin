import type { SimRekognitionEyeDirectionOutput } from "../command/detect-faces/detect-faces.command.js";
import type { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import type { SimRekognitionDeclaredEyeDirection } from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { SimRekognitionFaceMeasures } from "./sim-rekognition-face-measures.js";

/**
 * Where one declared face is looking.
 *
 * This is the gaze rather than the pose: a face turned one way can be looking
 * another, which is why Rekognition reports the two separately.
 */
export class SimRekognitionFaceEyeDirection {
  private readonly eyeDirection: SimRekognitionEyeDirectionOutput | undefined;

  constructor(
    subject: string,
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredEyeDirection | undefined,
  ) {
    this.eyeDirection = SimRekognitionFaceEyeDirection.directionOf(
      subject,
      confidence,
      declared,
    );
  }

  private static directionOf(
    subject: string,
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredEyeDirection | undefined,
  ): SimRekognitionEyeDirectionOutput | undefined {
    if (declared === undefined) {
      return undefined;
    }

    const measures = new SimRekognitionFaceMeasures(subject);

    return {
      Yaw: measures.angle("eye direction yaw", declared.yaw),
      Pitch: measures.angle("eye direction pitch", declared.pitch),
      Confidence: confidence.of(subject, declared.confidence),
    };
  }

  /**
   * Add the eye direction this face declared to a detail.
   */
  addTo(builder: SimRekognitionFaceDetailBuilder): void {
    builder.carry("EyeDirection", "EYE_DIRECTION", this.eyeDirection);
  }
}
