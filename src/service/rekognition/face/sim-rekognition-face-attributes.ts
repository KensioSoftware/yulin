import { SimRekognitionInvalidParameterException } from "../error/sim-rekognition.error.js";

/**
 * The attribute the members every response carries belong to.
 *
 * `BoundingBox`, `Confidence`, `Pose`, `Quality` and `Landmarks` come back
 * whatever the request asked for, which is what AWS means by a default subset.
 */
export const simRekognitionDefaultFaceAttribute = "DEFAULT";

const allAttributes = "ALL";

/**
 * The values `Attributes` accepts, other than `DEFAULT` and `ALL`.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_DetectFaces.html
 */
export const simRekognitionFaceAttributeNames = [
  "AGE_RANGE",
  "BEARD",
  "EMOTIONS",
  "EYE_DIRECTION",
  "EYEGLASSES",
  "EYES_OPEN",
  "GENDER",
  "MOUTH_OPEN",
  "MUSTACHE",
  "FACE_OCCLUDED",
  "SMILE",
  "SUNGLASSES",
] as const;

/**
 * The name of one facial attribute a response can carry.
 */
export type SimRekognitionFaceAttributeName =
  | typeof simRekognitionDefaultFaceAttribute
  | (typeof simRekognitionFaceAttributeNames)[number];

const accepted: ReadonlySet<string> = new Set([
  simRekognitionDefaultFaceAttribute,
  allAttributes,
  ...simRekognitionFaceAttributeNames,
]);

/**
 * The facial attributes one DetectFaces request asked for.
 *
 * The default subset is always carried, so `["FACE_OCCLUDED"]` is the default
 * subset with face occlusion added rather than face occlusion on its own, and
 * `["ALL", "DEFAULT"]` is the union the two describe together.
 */
export class SimRekognitionFaceAttributes {
  private readonly requested: ReadonlySet<string>;

  constructor(requested: readonly string[] = []) {
    for (const attribute of requested) {
      SimRekognitionFaceAttributes.refuseUnknown(attribute);
    }

    this.requested = new Set(requested);
  }

  private static refuseUnknown(attribute: string): void {
    if (accepted.has(attribute)) {
      return;
    }

    throw new SimRekognitionInvalidParameterException(
      `Request has invalid parameters: Attributes of ${attribute} is not a ` +
        `facial attribute Rekognition reports`,
    );
  }

  /**
   * Whether a response is to carry the members of one attribute.
   */
  wants(attribute: SimRekognitionFaceAttributeName): boolean {
    if (attribute === simRekognitionDefaultFaceAttribute) {
      return true;
    }

    return this.requested.has(allAttributes) || this.requested.has(attribute);
  }

  /**
   * Whether every declared landmark is to be reported.
   *
   * Real Rekognition reports five landmarks unless `ALL` was asked for, and
   * the whole set when it was.
   */
  wantsEveryLandmark(): boolean {
    return this.requested.has(allAttributes);
  }
}
