import type { SimRekognitionLandmarkOutput } from "../command/detect-faces/detect-faces.command.js";
import {
  simRekognitionDefaultFaceAttribute,
  type SimRekognitionFaceAttributes,
} from "./sim-rekognition-face-attributes.js";
import type { SimRekognitionDeclaredLandmarks } from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { SimRekognitionFaceLandmarkPoints } from "./sim-rekognition-face-landmark-points.js";
import { simRekognitionDefaultLandmarkNames } from "./sim-rekognition-landmark-name.js";

/**
 * The landmarks one declared face reports.
 */
export class SimRekognitionFaceLandmarks {
  private readonly landmarks: readonly SimRekognitionLandmarkOutput[];

  constructor(subject: string, declared: SimRekognitionDeclaredLandmarks = {}) {
    this.landmarks = new SimRekognitionFaceLandmarkPoints(
      subject,
      declared,
    ).resolve();
  }

  /**
   * Add the landmarks this face declared to a detail.
   *
   * A request that did not ask for `ALL` gets the five landmarks real
   * Rekognition reports by default, so a caller reading `chinBottom` from a
   * default request reads nothing here and nothing on AWS.
   */
  addTo(
    builder: SimRekognitionFaceDetailBuilder,
    attributes: SimRekognitionFaceAttributes,
  ): void {
    builder.carry(
      "Landmarks",
      simRekognitionDefaultFaceAttribute,
      this.reported(attributes),
    );
  }

  private reported(
    attributes: SimRekognitionFaceAttributes,
  ): readonly SimRekognitionLandmarkOutput[] | undefined {
    if (this.landmarks.length === 0) {
      return undefined;
    }

    if (attributes.wantsEveryLandmark()) {
      return this.landmarks;
    }

    return this.landmarks.filter((landmark) =>
      simRekognitionDefaultLandmarkNames.has(landmark.Type),
    );
  }
}
