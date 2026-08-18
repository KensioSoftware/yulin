import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";
import {
  type SimRekognitionImageRequest,
  SimRekognitionImageRequests,
} from "../../image/sim-rekognition-image-request.js";
import { requiredCollectionId } from "../collection/collection-id.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import { SimRekognitionFaceLimit } from "./face-limits.js";
import type { SimSearchFacesByImageCommandInput } from "./face.command.js";

const operation = "SearchFacesByImage";
const acceptedInput = [
  "CollectionId",
  "Image",
  "FaceMatchThreshold",
  "MaxFaces",
];

/**
 * The most faces real Rekognition returns from one search.
 */
const maxFaces = new SimRekognitionFaceLimit({ most: 4096 });

/**
 * How alike real Rekognition requires a face to be when a request does not
 * say.
 */
const defaultThreshold = 80;

/**
 * A SearchFacesByImage request, checked before anything acts on it.
 *
 * `QualityFilter` is refused for the reason IndexFaces refuses it: nothing
 * here judges an image, so a filter set on the request would drop the searched
 * face on AWS and keep it here.
 */
export class SearchFacesByImageRequest {
  public readonly collectionId: string;
  public readonly image: SimRekognitionImageRequest;
  public readonly threshold: number;
  public readonly maxFaces: number | undefined;

  constructor(input: SimSearchFacesByImageCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.collectionId = requiredCollectionId(input.CollectionId);
    this.image = new SimRekognitionImageRequests(operation).parse(input.Image);
    this.threshold = SearchFacesByImageRequest.thresholdOf(
      input.FaceMatchThreshold,
    );
    this.maxFaces = maxFaces.of(input.MaxFaces);
  }

  /**
   * How alike this search requires a face to be.
   *
   * The default applies only when the request left it out, so an explicit `0`
   * asks for every declared match rather than being promoted to 80.
   */
  private static thresholdOf(requested: number | undefined): number {
    if (requested === undefined) {
      return defaultThreshold;
    }

    // A NaN is refused rather than compared against, as it is everywhere else
    // a confidence is: every comparison with one is false, so it would filter
    // every match out and look like a search that found nobody.
    if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: FaceMatchThreshold of ` +
          `${String(requested)} is not a percentage from 0 to 100`,
      );
    }

    return requested;
  }
}
