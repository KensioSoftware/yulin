import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";

/**
 * The most face ids real Rekognition takes in one request.
 */
const mostFaceIds = 4096;

/**
 * The shape of a face id, which is a lowercase uuid.
 *
 * Real Rekognition checks this before it looks a face up, so an id in another
 * shape is a malformed request there. Checking it here keeps that a malformed
 * request rather than a face the collection turns out not to hold.
 */
const faceIdShape =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

function refuseUnusable(faceIds: readonly string[]): void {
  if (faceIds.length === 0 || faceIds.length > mostFaceIds) {
    throw new SimRekognitionInvalidParameterException(
      `Request has invalid parameters: FaceIds holds ` +
        `${String(faceIds.length)} face ids, where Rekognition takes from 1 ` +
        `to ${String(mostFaceIds)}`,
    );
  }

  for (const faceId of faceIds) {
    if (!faceIdShape.test(faceId)) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: FaceIds holds '${faceId}', which is ` +
          `not a Rekognition face id. A face id is the lowercase uuid ` +
          `IndexFaces answered with.`,
      );
    }
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
