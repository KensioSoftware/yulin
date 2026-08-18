import { requiredCollectionId } from "../collection/collection-id.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import { requiredFaceIds } from "./face-ids.js";
import type { SimDeleteFacesCommandInput } from "./face.command.js";

const operation = "DeleteFaces";
const acceptedInput = ["CollectionId", "FaceIds"];

/**
 * A DeleteFaces request, checked before anything acts on it.
 */
export class DeleteFacesRequest {
  public readonly collectionId: string;
  public readonly faceIds: readonly string[];

  constructor(input: SimDeleteFacesCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.collectionId = requiredCollectionId(input.CollectionId);
    this.faceIds = requiredFaceIds(input.FaceIds);
  }
}
