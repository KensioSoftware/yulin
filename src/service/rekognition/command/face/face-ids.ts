import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";

/**
 * The most face ids real Rekognition takes in one request.
 */
const mostFaceIds = 4096;

function refuseUnusable(faceIds: readonly string[]): void {
  if (faceIds.length === 0 || faceIds.length > mostFaceIds) {
    throw new SimRekognitionInvalidParameterException(
      `Request has invalid parameters: FaceIds holds ` +
        `${String(faceIds.length)} face ids, where Rekognition takes from 1 ` +
        `to ${String(mostFaceIds)}`,
    );
  }
}

/**
 * The face ids a request named, where naming none is the whole collection.
 */
export function selectedFaceIds(
  faceIds: readonly string[] | undefined,
): readonly string[] | undefined {
  if (faceIds === undefined) {
    return undefined;
  }

  refuseUnusable(faceIds);

  return faceIds;
}

/**
 * The face ids a request named, refusing one that named none.
 */
export function requiredFaceIds(
  faceIds: readonly string[] | undefined,
): readonly string[] {
  if (faceIds === undefined) {
    throw new SimRekognitionInvalidParameterException("FaceIds is required");
  }

  refuseUnusable(faceIds);

  return faceIds;
}
