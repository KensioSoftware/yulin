import type { SimRekognitionFaceFeatureOutput } from "../command/detect-faces/detect-faces.command.js";
import type { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import { simRekognitionDeclaredFaceFeature } from "./sim-rekognition-declared-value.js";
import type { SimRekognitionDeclaredFace } from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { simRekognitionFaceFeatureMembers } from "./sim-rekognition-face-feature-members.js";

type SimRekognitionResolvedFeature =
  (typeof simRekognitionFaceFeatureMembers)[number] & {
    readonly value: SimRekognitionFaceFeatureOutput;
  };

/**
 * The yes or no attributes one declared face carries.
 *
 * A feature declared as a bare `true` or `false` takes the face's own
 * confidence, since a face detected at 99.9 is not usually judged to be
 * wearing sunglasses at 40.
 */
export class SimRekognitionFaceFeatures {
  private readonly features: readonly SimRekognitionResolvedFeature[];

  constructor(
    subject: string,
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredFace,
  ) {
    this.features = simRekognitionFaceFeatureMembers.flatMap((feature) => {
      const value = declared[feature.declared];

      if (value === undefined) {
        return [];
      }

      const read = simRekognitionDeclaredFaceFeature(value);

      return [
        {
          ...feature,
          value: {
            Value: read.value,
            Confidence: confidence.of(subject, read.confidence),
          },
        },
      ];
    });
  }

  /**
   * Add the features this face declared to a detail.
   */
  addTo(builder: SimRekognitionFaceDetailBuilder): void {
    for (const feature of this.features) {
      builder.carry(feature.member, feature.attribute, feature.value);
    }
  }
}
