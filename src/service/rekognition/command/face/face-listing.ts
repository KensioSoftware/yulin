import type { SimRekognitionCollection } from "../../collection/sim-rekognition-collection.js";
import type { SimListFacesCommandOutput } from "./face.command.js";
import type { ListFacesRequest } from "./list-faces-request.js";
import { SimRekognitionFacePage } from "./list-faces-page.js";

interface SimRekognitionFaceListingProperties {
  readonly collection: SimRekognitionCollection;
  readonly request: ListFacesRequest;
}

/**
 * Reads the faces one collection holds.
 *
 * A request naming no face ids lists the whole collection, and one naming
 * some narrows the listing to those, leaving out any id the collection does
 * not hold. Paging is applied after that, so a page is a page of what the
 * request selected.
 */
export class SimRekognitionFaceListing {
  private readonly collection: SimRekognitionCollection;
  private readonly request: ListFacesRequest;

  constructor(properties: SimRekognitionFaceListingProperties) {
    this.collection = properties.collection;
    this.request = properties.request;
  }

  /**
   * The page of faces this request asked for.
   */
  list(): SimListFacesCommandOutput {
    const { faceIds, maxResults, nextToken } = this.request;
    const held = this.collection.faces;
    const page = new SimRekognitionFacePage({
      listed: faceIds === undefined ? held.all() : held.withIds(faceIds),
      maxResults,
      nextToken,
    });

    return {
      Faces: page.faces.map((face) => face.stored()),
      ...(page.nextToken !== undefined && { NextToken: page.nextToken }),
      FaceModelVersion: this.collection.faceModelVersion,
      $metadata: {},
    };
  }
}
