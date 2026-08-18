import type { SimRekognitionCollection } from "../../collection/sim-rekognition-collection.js";
import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";
import type { SimRekognitionFaceDetection } from "../../face/sim-rekognition-face-detection.js";
import type { SimRekognitionFaceMatchResult } from "../../match/sim-rekognition-face-match-result.js";
import type { SimSearchFacesByImageCommandOutput } from "./face.command.js";
import type { SearchFacesByImageRequest } from "./search-faces-by-image-request.js";

interface SimRekognitionFaceSearcherProperties {
  readonly collection: SimRekognitionCollection;
  readonly detection: SimRekognitionFaceDetection;
  readonly declared: SimRekognitionFaceMatchResult;
  readonly request: SearchFacesByImageRequest;
}

/**
 * Searches one collection with one image.
 *
 * The face the search is made with is the first face the `faces()` rules
 * declare for the image, which is the face a real search would have measured
 * everything else against. Which faces it finds is what the `faceMatches()`
 * rules declare, narrowed to the faces the collection actually holds.
 */
export class SimRekognitionFaceSearcher {
  private readonly collection: SimRekognitionCollection;
  private readonly detection: SimRekognitionFaceDetection;
  private readonly declared: SimRekognitionFaceMatchResult;
  private readonly request: SearchFacesByImageRequest;

  constructor(properties: SimRekognitionFaceSearcherProperties) {
    this.collection = properties.collection;
    this.detection = properties.detection;
    this.declared = properties.declared;
    this.request = properties.request;
  }

  /**
   * The matches this search reports.
   */
  search(): SimSearchFacesByImageCommandOutput {
    const [searched] = this.detection.detected();

    if (searched === undefined) {
      throw new SimRekognitionInvalidParameterException(
        "Request has invalid parameters: there are no faces in the image, " +
          "and a search needs at least one to search with",
      );
    }

    const boundingBox = searched.boundingBox();

    return {
      ...(boundingBox !== undefined && {
        SearchedFaceBoundingBox: boundingBox,
      }),
      SearchedFaceConfidence: searched.confidence(),
      FaceMatches: this.declared.matchesIn(this.collection.faces, {
        threshold: this.request.threshold,
        mostFaces: this.request.maxFaces,
      }),
      FaceModelVersion: this.collection.faceModelVersion,
      $metadata: {},
    };
  }
}
