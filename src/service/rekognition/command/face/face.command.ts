import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRekognitionBoundingBoxOutput } from "../../image/sim-rekognition-bounding-box.js";
import type { SimRekognitionImageInput } from "../../image/sim-rekognition-image-input.js";
import type {
  SimRekognitionFaceMatchOutput,
  SimRekognitionFaceOutput,
  SimRekognitionFaceRecordOutput,
  SimRekognitionUnindexedFaceOutput,
  SimRekognitionUnsuccessfulFaceDeletionOutput,
} from "./face-output.js";

/**
 * Minimal structural sim Rekognition IndexFaces command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/IndexFacesCommand/
 */
export interface SimIndexFacesCommand {
  readonly input: SimIndexFacesCommandInput;
}

export interface SimIndexFacesCommandInput {
  readonly CollectionId?: string | undefined;
  readonly Image?: SimRekognitionImageInput | undefined;
  readonly ExternalImageId?: string | undefined;
  readonly DetectionAttributes?: readonly string[] | undefined;
  readonly MaxFaces?: number | undefined;
}

/**
 * The IndexFaces response.
 *
 * `OrientationCorrection` is not carried, for the reason it is left off a
 * DetectFaces response: AWS documents its value as always null.
 */
export interface SimIndexFacesCommandOutput {
  readonly FaceRecords: readonly SimRekognitionFaceRecordOutput[];
  readonly UnindexedFaces: readonly SimRekognitionUnindexedFaceOutput[];
  readonly FaceModelVersion: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Rekognition ListFaces command.
 */
export interface SimListFacesCommand {
  readonly input: SimListFacesCommandInput;
}

export interface SimListFacesCommandInput {
  readonly CollectionId?: string | undefined;
  readonly FaceIds?: readonly string[] | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * The ListFaces response.
 *
 * A `NextToken` is carried only when the request set a `MaxResults` the
 * collection is larger than, since a listing that asked for no page size comes
 * back in one page.
 */
export interface SimListFacesCommandOutput {
  readonly Faces: readonly SimRekognitionFaceOutput[];
  readonly NextToken?: string;
  readonly FaceModelVersion: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Rekognition SearchFacesByImage command.
 */
export interface SimSearchFacesByImageCommand {
  readonly input: SimSearchFacesByImageCommandInput;
}

export interface SimSearchFacesByImageCommandInput {
  readonly CollectionId?: string | undefined;
  readonly Image?: SimRekognitionImageInput | undefined;
  readonly FaceMatchThreshold?: number | undefined;
  readonly MaxFaces?: number | undefined;
}

/**
 * The SearchFacesByImage response.
 *
 * The searched face is the first face the `faces()` rules declare for the
 * image, which is the face a real search would have measured everything else
 * against.
 */
export interface SimSearchFacesByImageCommandOutput {
  readonly SearchedFaceBoundingBox?: SimRekognitionBoundingBoxOutput;
  readonly SearchedFaceConfidence: number;
  readonly FaceMatches: readonly SimRekognitionFaceMatchOutput[];
  readonly FaceModelVersion: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Rekognition DeleteFaces command.
 */
export interface SimDeleteFacesCommand {
  readonly input: SimDeleteFacesCommandInput;
}

export interface SimDeleteFacesCommandInput {
  readonly CollectionId?: string | undefined;
  readonly FaceIds?: readonly string[] | undefined;
}

/**
 * The DeleteFaces response.
 *
 * A face id the collection does not hold comes back in
 * `UnsuccessfulFaceDeletions` as `FACE_NOT_FOUND`, as it does on AWS. The other
 * reason real Rekognition reports there is
 * `ASSOCIATED_TO_AN_EXISTING_USER`, and nothing here associates a face with a
 * user.
 */
export interface SimDeleteFacesCommandOutput {
  readonly DeletedFaces: readonly string[];
  readonly UnsuccessfulFaceDeletions: readonly SimRekognitionUnsuccessfulFaceDeletionOutput[];
  readonly $metadata: SimResponseMetadata;
}
