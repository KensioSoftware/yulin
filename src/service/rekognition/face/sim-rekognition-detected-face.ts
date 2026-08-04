import type { SimRekognitionFaceDetailOutput } from "../command/detect-faces/detect-faces.command.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import { SimRekognitionFaceAgeAndGender } from "./sim-rekognition-face-age-and-gender.js";
import type { SimRekognitionFaceAttributes } from "./sim-rekognition-face-attributes.js";
import type { SimRekognitionDeclaredFace } from "./sim-rekognition-face-declaration.js";
import { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { SimRekognitionFaceEmotions } from "./sim-rekognition-face-emotions.js";
import { SimRekognitionFaceEyeDirection } from "./sim-rekognition-face-eye-direction.js";
import { SimRekognitionFaceFeatures } from "./sim-rekognition-face-features.js";
import { SimRekognitionFaceFrame } from "./sim-rekognition-face-frame.js";
import { SimRekognitionFaceLandmarks } from "./sim-rekognition-face-landmarks.js";

/**
 * One declared face, resolved into what a response can carry for it.
 *
 * The declaration is resolved when the rule is registered rather than when a
 * detection runs, so a bounding box or an angle that is out of range is
 * refused where it was written.
 *
 * The attributes are held by the small pieces that own them, and each adds
 * its own members to a detail. A request asking for a subset of them is
 * answered by leaving the rest out, so nothing here has to know which
 * attributes any one request wanted.
 */
export class SimRekognitionDetectedFace {
  private readonly frame: SimRekognitionFaceFrame;
  private readonly landmarks: SimRekognitionFaceLandmarks;
  private readonly features: SimRekognitionFaceFeatures;
  private readonly emotions: SimRekognitionFaceEmotions;
  private readonly ageAndGender: SimRekognitionFaceAgeAndGender;
  private readonly eyeDirection: SimRekognitionFaceEyeDirection;

  constructor(subject: string, declared: SimRekognitionDeclaredFace) {
    this.frame = new SimRekognitionFaceFrame(subject, declared);

    // An attribute with no confidence of its own takes the face's, since a
    // face detected at 99.9 is not usually judged to be smiling at 40.
    const confidence = new SimRekognitionDeclaredConfidence(
      this.frame.confidence,
    );

    this.landmarks = new SimRekognitionFaceLandmarks(
      subject,
      declared.landmarks,
    );
    this.features = new SimRekognitionFaceFeatures(
      subject,
      confidence,
      declared,
    );
    this.emotions = new SimRekognitionFaceEmotions(
      subject,
      confidence,
      declared.emotions,
    );
    this.ageAndGender = new SimRekognitionFaceAgeAndGender(
      subject,
      confidence,
      declared,
    );
    this.eyeDirection = new SimRekognitionFaceEyeDirection(
      subject,
      confidence,
      declared.eyeDirection,
    );
  }

  /**
   * The detail to report for this face, as one request asked for it.
   */
  detailFor(
    attributes: SimRekognitionFaceAttributes,
  ): SimRekognitionFaceDetailOutput {
    const builder = new SimRekognitionFaceDetailBuilder(attributes);

    this.frame.addTo(builder);
    this.landmarks.addTo(builder, attributes);
    this.features.addTo(builder);
    this.emotions.addTo(builder);
    this.ageAndGender.addTo(builder);
    this.eyeDirection.addTo(builder);

    return builder.build();
  }
}
