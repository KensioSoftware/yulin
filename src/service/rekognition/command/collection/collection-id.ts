import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";

/**
 * The collection a request named, refusing one that named none.
 *
 * Real Rekognition requires a CollectionId on every operation that works on
 * one, and reports an omitted one as a malformed request rather than as a
 * collection it could not find.
 */
export function requiredCollectionId(collectionId: string | undefined): string {
  if (collectionId === undefined || collectionId.length === 0) {
    throw new SimRekognitionInvalidParameterException(
      "CollectionId is required",
    );
  }

  return collectionId;
}
