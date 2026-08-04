import type { SimRekognitionDeclaredBoundingBox } from "../image/sim-rekognition-bounding-box.js";
import type { SimRekognitionEmotionName } from "./sim-rekognition-emotion-name.js";
import type { SimRekognitionLandmarkName } from "./sim-rekognition-landmark-name.js";

/**
 * A point on a face, as ratios of the image's own width and height.
 */
export interface SimRekognitionDeclaredPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the landmarks of a declared face are.
 *
 * Landmarks are keyed by the names Rekognition reports them under, so a face
 * declares the ones the test cares about and leaves the rest out. They are
 * not required to sit inside the bounding box: a real Rekognition face box
 * routinely excludes the chin.
 */
export type SimRekognitionDeclaredLandmarks = Partial<
  Record<SimRekognitionLandmarkName, SimRekognitionDeclaredPoint>
>;

/**
 * A face attribute Rekognition answers yes or no to, such as whether the face
 * is smiling.
 *
 * A bare boolean is the attribute at the face's own confidence. The longer
 * form says how sure Rekognition is of the answer, which is a confidence in
 * the determination rather than in the value: a `false` at 99 is a face
 * Rekognition is sure is not smiling.
 */
export type SimRekognitionDeclaredFaceFeature =
  | boolean
  | {
      readonly value: boolean;
      readonly confidence?: number | undefined;
    };

/**
 * The gender Rekognition predicts for a face.
 *
 * Real Rekognition predicts `Male` or `Female` and nothing else, so those are
 * the two values a declaration can use.
 */
export type SimRekognitionDeclaredGender =
  | "Male"
  | "Female"
  | {
      readonly value: "Male" | "Female";
      readonly confidence?: number | undefined;
    };

/**
 * One emotion a declared face appears to express.
 */
export type SimRekognitionDeclaredEmotion =
  | SimRekognitionEmotionName
  | {
      readonly type: SimRekognitionEmotionName;
      readonly confidence?: number | undefined;
    };

/**
 * The age range Rekognition estimates for a face, in whole years.
 */
export interface SimRekognitionDeclaredAgeRange {
  readonly low: number;
  readonly high: number;
}

/**
 * How a declared face is turned, in degrees.
 */
export interface SimRekognitionDeclaredPose {
  readonly roll: number;
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * How well a declared face was captured, each from 0 to 100.
 */
export interface SimRekognitionDeclaredFaceQuality {
  readonly brightness: number;
  readonly sharpness: number;
}

/**
 * Where a declared face is looking, in degrees.
 */
export interface SimRekognitionDeclaredEyeDirection {
  readonly yaw: number;
  readonly pitch: number;
  readonly confidence?: number | undefined;
}

/**
 * A face declared against an image, with what Rekognition is to report for it.
 *
 * Everything is optional. An attribute nothing was declared for is left out of
 * the response rather than invented, so a face declared with a bounding box
 * and nothing else comes back as a bounding box and a confidence however many
 * attributes the request asked for.
 */
export interface SimRekognitionDeclaredFace {
  readonly boundingBox?: SimRekognitionDeclaredBoundingBox | undefined;
  readonly confidence?: number | undefined;
  readonly pose?: SimRekognitionDeclaredPose | undefined;
  readonly quality?: SimRekognitionDeclaredFaceQuality | undefined;
  readonly landmarks?: SimRekognitionDeclaredLandmarks | undefined;
  readonly ageRange?: SimRekognitionDeclaredAgeRange | undefined;
  readonly gender?: SimRekognitionDeclaredGender | undefined;
  readonly emotions?: readonly SimRekognitionDeclaredEmotion[] | undefined;
  readonly eyeDirection?: SimRekognitionDeclaredEyeDirection | undefined;
  readonly smile?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly eyeglasses?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly sunglasses?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly beard?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly mustache?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly eyesOpen?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly mouthOpen?: SimRekognitionDeclaredFaceFeature | undefined;
  readonly faceOccluded?: SimRekognitionDeclaredFaceFeature | undefined;
}

/**
 * What DetectFaces answers with for an image.
 *
 * An image with no faces in it is `{ faces: [] }`, which is a detection that
 * found nothing rather than an image nothing was declared for.
 */
export interface SimRekognitionFacesResult {
  readonly faces: readonly SimRekognitionDeclaredFace[];
}
