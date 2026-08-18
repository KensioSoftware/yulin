import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";

/**
 * The characters real Rekognition accepts in an ExternalImageId.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_IndexFaces.html
 */
const accepted = /^[\w.\-:]+$/;

const longest = 255;

/**
 * The external image id an indexing request chose, checked as AWS checks it.
 *
 * It is the id an application ties a face back to its own records with, so it
 * is checked here rather than stored as given: an id real Rekognition would
 * refuse would otherwise work in a test and fail in production.
 */
export function acceptedExternalImageId(
  externalImageId: string | undefined,
): string | undefined {
  if (externalImageId === undefined) {
    return undefined;
  }

  if (externalImageId.length > longest || !accepted.test(externalImageId)) {
    throw new SimRekognitionInvalidParameterException(
      `Request has invalid parameters: ExternalImageId of ` +
        `'${externalImageId}' is not one Rekognition accepts, which is up ` +
        `to ${String(longest)} letters, digits, underscores, hyphens, full ` +
        `stops and colons`,
    );
  }

  return externalImageId;
}
