import { SimRekognitionFaceAttributes } from "../../face/sim-rekognition-face-attributes.js";
import {
  type SimRekognitionImageRequest,
  SimRekognitionImageRequests,
} from "../../image/sim-rekognition-image-request.js";
import { requiredCollectionId } from "../collection/collection-id.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import { acceptedExternalImageId } from "./external-image-id.js";
import { SimRekognitionFaceLimit } from "./face-limits.js";
import type { SimIndexFacesCommandInput } from "./face.command.js";

const operation = "IndexFaces";
const acceptedInput = [
  "CollectionId",
  "Image",
  "ExternalImageId",
  "DetectionAttributes",
  "MaxFaces",
];

const maxFaces = new SimRekognitionFaceLimit();

/**
 * An IndexFaces request, checked before anything acts on it.
 *
 * `QualityFilter` is refused with everything else this simulation does not
 * model. Real Rekognition uses it to drop faces it judges too blurry or too
 * small to index, and nothing here judges an image, so a request setting it
 * would have faces dropped on AWS and kept here.
 */
export class IndexFacesRequest {
  public readonly collectionId: string;
  public readonly image: SimRekognitionImageRequest;
  public readonly externalImageId: string | undefined;
  public readonly attributes: SimRekognitionFaceAttributes;
  public readonly maxFaces: number | undefined;

  constructor(input: SimIndexFacesCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.collectionId = requiredCollectionId(input.CollectionId);
    this.image = new SimRekognitionImageRequests(operation).parse(input.Image);
    this.externalImageId = acceptedExternalImageId(input.ExternalImageId);
    this.attributes = new SimRekognitionFaceAttributes(
      input.DetectionAttributes,
    );
    this.maxFaces = maxFaces.of(input.MaxFaces);
  }
}
