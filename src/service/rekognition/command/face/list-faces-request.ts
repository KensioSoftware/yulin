import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";
import { requiredCollectionId } from "../collection/collection-id.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import { selectedFaceIds } from "./face-ids.js";
import type { SimListFacesCommandInput } from "./face.command.js";

const operation = "ListFaces";
const acceptedInput = ["CollectionId", "FaceIds", "MaxResults", "NextToken"];

/**
 * The largest page real Rekognition returns.
 */
const mostResults = 4096;

/**
 * A ListFaces request, checked before anything acts on it.
 *
 * `UserId` is refused with everything else this simulation does not model.
 * Nothing here associates a face with a user, so a listing narrowed to one
 * would answer with every face in the collection.
 */
export class ListFacesRequest {
  public readonly collectionId: string;
  public readonly faceIds: readonly string[] | undefined;
  public readonly maxResults: number | undefined;
  public readonly nextToken: string | undefined;

  constructor(input: SimListFacesCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.collectionId = requiredCollectionId(input.CollectionId);
    this.faceIds = selectedFaceIds(input.FaceIds);
    this.maxResults = ListFacesRequest.maxResultsOf(input.MaxResults);
    this.nextToken = input.NextToken;
  }

  private static maxResultsOf(
    requested: number | undefined,
  ): number | undefined {
    if (requested === undefined) {
      return undefined;
    }

    if (
      !Number.isSafeInteger(requested) ||
      requested < 1 ||
      requested > mostResults
    ) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: MaxResults of ${String(requested)} ` +
          `is not a whole number of faces from 1 to ${String(mostResults)}`,
      );
    }

    return requested;
  }
}
