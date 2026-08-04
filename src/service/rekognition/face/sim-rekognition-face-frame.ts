import type {
  SimRekognitionImageQualityOutput,
  SimRekognitionPoseOutput,
} from "../command/detect-faces/detect-faces.command.js";
import {
  SimRekognitionBoundingBoxes,
  type SimRekognitionBoundingBoxOutput,
} from "../image/sim-rekognition-bounding-box.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import { simRekognitionDefaultFaceAttribute as defaultAttribute } from "./sim-rekognition-face-attributes.js";
import type {
  SimRekognitionDeclaredFace,
  SimRekognitionDeclaredFaceQuality,
  SimRekognitionDeclaredPose,
} from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";
import { SimRekognitionFaceMeasures } from "./sim-rekognition-face-measures.js";

/**
 * The confidence a declared face is detected at when none is declared for it.
 *
 * It is the confidence in the AWS DetectFaces example response rather than a
 * round number, because declared confidences pass through `Math.fround` and a
 * real one has the float32 tail a test can assert on.
 */
const faceConfidence = new SimRekognitionDeclaredConfidence(99.99872589111328);

function boundingBoxOf(
  subject: string,
  declared: SimRekognitionDeclaredFace,
): SimRekognitionBoundingBoxOutput | undefined {
  if (declared.boundingBox === undefined) {
    return undefined;
  }

  return new SimRekognitionBoundingBoxes(subject).of(declared.boundingBox);
}

function poseOf(
  measures: SimRekognitionFaceMeasures,
  declared: SimRekognitionDeclaredPose | undefined,
): SimRekognitionPoseOutput | undefined {
  if (declared === undefined) {
    return undefined;
  }

  return {
    Roll: measures.angle("roll", declared.roll),
    Yaw: measures.angle("yaw", declared.yaw),
    Pitch: measures.angle("pitch", declared.pitch),
  };
}

function qualityOf(
  measures: SimRekognitionFaceMeasures,
  declared: SimRekognitionDeclaredFaceQuality | undefined,
): SimRekognitionImageQualityOutput | undefined {
  if (declared === undefined) {
    return undefined;
  }

  return {
    Brightness: measures.percentage("brightness", declared.brightness),
    Sharpness: measures.percentage("sharpness", declared.sharpness),
  };
}

/**
 * The default subset of a detected face, bar its landmarks: where it is, how
 * sure Rekognition is that it is a face, how it is turned and how well it was
 * captured.
 *
 * The confidence is the one member always reported, since a declared face is a
 * face the detection found. Everything else here is carried only when it was
 * declared.
 */
export class SimRekognitionFaceFrame {
  /**
   * The confidence this face was detected at, which its attributes take when
   * they declare none of their own.
   */
  public readonly confidence: number;

  private readonly boundingBox: SimRekognitionBoundingBoxOutput | undefined;
  private readonly pose: SimRekognitionPoseOutput | undefined;
  private readonly quality: SimRekognitionImageQualityOutput | undefined;

  constructor(subject: string, declared: SimRekognitionDeclaredFace) {
    const measures = new SimRekognitionFaceMeasures(subject);

    this.confidence = faceConfidence.of(subject, declared.confidence);
    this.boundingBox = boundingBoxOf(subject, declared);
    this.pose = poseOf(measures, declared.pose);
    this.quality = qualityOf(measures, declared.quality);
  }

  /**
   * Add what this face frame reports to a detail.
   */
  addTo(builder: SimRekognitionFaceDetailBuilder): void {
    builder
      .carry("BoundingBox", defaultAttribute, this.boundingBox)
      .carry("Confidence", defaultAttribute, this.confidence)
      .carry("Pose", defaultAttribute, this.pose)
      .carry("Quality", defaultAttribute, this.quality);
  }
}
