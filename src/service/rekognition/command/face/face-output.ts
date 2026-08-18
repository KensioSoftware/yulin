import type { SimRekognitionFaceDetailOutput } from "../detect-faces/detect-faces.command.js";
import type { SimRekognitionBoundingBoxOutput } from "../../image/sim-rekognition-bounding-box.js";

/**
 * One face held in a collection.
 *
 * `UserId` is left out, because associating a face with a user is a layer
 * above this one and nothing here creates a user.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Face.html
 */
export interface SimRekognitionFaceOutput {
  readonly FaceId: string;
  readonly ImageId: string;
  readonly BoundingBox?: SimRekognitionBoundingBoxOutput;
  readonly ExternalImageId?: string;
  readonly Confidence: number;
  readonly IndexFacesModelVersion: string;
}

/**
 * One face IndexFaces put in a collection, with the detail it was indexed
 * from.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FaceRecord.html
 */
export interface SimRekognitionFaceRecordOutput {
  readonly Face: SimRekognitionFaceOutput;
  readonly FaceDetail: SimRekognitionFaceDetailOutput;
}

/**
 * One face IndexFaces left out of a collection, and why.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_UnindexedFace.html
 */
export interface SimRekognitionUnindexedFaceOutput {
  readonly Reasons: readonly string[];
  readonly FaceDetail: SimRekognitionFaceDetailOutput;
}

/**
 * One face a search found, and how alike the search says it is.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FaceMatch.html
 */
export interface SimRekognitionFaceMatchOutput {
  readonly Similarity: number;
  readonly Face: SimRekognitionFaceOutput;
}
