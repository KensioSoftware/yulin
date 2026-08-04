import type { SimRekognitionFaceDetailOutput } from "../command/detect-faces/detect-faces.command.js";
import type { SimRekognitionFaceAttributeName } from "./sim-rekognition-face-attributes.js";
import type { SimRekognitionDeclaredFace } from "./sim-rekognition-face-declaration.js";

/**
 * How one yes or no attribute is declared, reported and asked for.
 *
 * The three names are listed beside each other because none of them match:
 * `eyesOpen` is declared, reported as `EyesOpen` and asked for as
 * `EYES_OPEN`.
 */
export interface SimRekognitionFaceFeatureMember {
  readonly declared: keyof SimRekognitionDeclaredFace;
  readonly member: keyof SimRekognitionFaceDetailOutput;
  readonly attribute: SimRekognitionFaceAttributeName;
}

/**
 * The face attributes Rekognition answers yes or no to.
 *
 * All eight are one value and one confidence on the wire, so all eight are
 * declared, checked and reported the same way. The list is here rather than
 * beside the code that reads it because it is a table of names.
 */
export const simRekognitionFaceFeatureMembers = [
  { declared: "smile", member: "Smile", attribute: "SMILE" },
  { declared: "eyeglasses", member: "Eyeglasses", attribute: "EYEGLASSES" },
  { declared: "sunglasses", member: "Sunglasses", attribute: "SUNGLASSES" },
  { declared: "beard", member: "Beard", attribute: "BEARD" },
  { declared: "mustache", member: "Mustache", attribute: "MUSTACHE" },
  { declared: "eyesOpen", member: "EyesOpen", attribute: "EYES_OPEN" },
  { declared: "mouthOpen", member: "MouthOpen", attribute: "MOUTH_OPEN" },
  {
    declared: "faceOccluded",
    member: "FaceOccluded",
    attribute: "FACE_OCCLUDED",
  },
] as const satisfies readonly SimRekognitionFaceFeatureMember[];
