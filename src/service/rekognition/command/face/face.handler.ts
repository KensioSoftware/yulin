import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimRekognitionCollection } from "../../collection/sim-rekognition-collection.js";
import type { SimRekognitionCollections } from "../../collection/sim-rekognition-collections.js";
import type { SimRekognitionFaces } from "../../face/sim-rekognition-faces.js";
import type { SimRekognitionImageObjects } from "../../image/sim-rekognition-image-objects.js";
import type { SimRekognitionFaceMatches } from "../../match/sim-rekognition-face-matches.js";
import type { SimRekognitionAuthorizer } from "../authorize/sim-rekognition-authorizer.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";
import { DeleteFacesRequest } from "./delete-faces-request.js";
import { simRekognitionFaceNotFound } from "./face-output.js";
import { SimRekognitionFaceIndexer } from "./face-indexer.js";
import { SimRekognitionFaceListing } from "./face-listing.js";
import { SimRekognitionFaceSearcher } from "./face-searcher.js";
import type {
  SimDeleteFacesCommand,
  SimDeleteFacesCommandOutput,
  SimIndexFacesCommand,
  SimIndexFacesCommandOutput,
  SimListFacesCommand,
  SimListFacesCommandOutput,
  SimSearchFacesByImageCommand,
  SimSearchFacesByImageCommandOutput,
} from "./face.command.js";
import { IndexFacesRequest } from "./index-faces-request.js";
import { ListFacesRequest } from "./list-faces-request.js";
import { SearchFacesByImageRequest } from "./search-faces-by-image-request.js";

interface SimRekognitionFaceHandlerProperties {
  readonly collections: SimRekognitionCollections;
  readonly faces: SimRekognitionFaces;
  readonly faceMatches: SimRekognitionFaceMatches;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly images: SimRekognitionImageObjects;
  readonly background: BackgroundScheduler;
}

/**
 * The simulated Rekognition operations that work on the faces in a collection.
 *
 * They are one handler for the reason the collection lifecycle operations are:
 * they share a store and an authorization shape. Each authorizes against the
 * collection's own ARN, and each does so before the collection is looked up,
 * so a caller without the permission is told about that rather than about
 * which collections exist.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/IndexFacesCommand/
 */
export class SimRekognitionFaceHandler {
  private readonly collections: SimRekognitionCollections;
  private readonly faces: SimRekognitionFaces;
  private readonly faceMatches: SimRekognitionFaceMatches;
  private readonly authorizer: SimRekognitionAuthorizer;
  private readonly images: SimRekognitionImageObjects;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimRekognitionFaceHandlerProperties) {
    this.collections = properties.collections;
    this.faces = properties.faces;
    this.faceMatches = properties.faceMatches;
    this.authorizer = properties.authorizer;
    this.images = properties.images;
    this.background = properties.background;
  }

  /**
   * Index the faces an image is declared to hold into a collection.
   */
  async index(
    command: SimIndexFacesCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimIndexFacesCommandOutput> {
    const request = new IndexFacesRequest(command.input);
    const collection = await this.reach(
      "rekognition:IndexFaces",
      request.collectionId,
      options,
    );
    const image = await request.image.read(this.images, options);

    return new SimRekognitionFaceIndexer({
      collection,
      detection: this.faces.detectionFor(image),
      request,
    }).index();
  }

  /**
   * List the faces one collection holds.
   */
  async list(
    command: SimListFacesCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimListFacesCommandOutput> {
    const request = new ListFacesRequest(command.input);
    const collection = await this.reach(
      "rekognition:ListFaces",
      request.collectionId,
      options,
    );

    return new SimRekognitionFaceListing({ collection, request }).list();
  }

  /**
   * Search a collection for the faces an image is declared to find.
   */
  async search(
    command: SimSearchFacesByImageCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimSearchFacesByImageCommandOutput> {
    const request = new SearchFacesByImageRequest(command.input);
    const collection = await this.reach(
      "rekognition:SearchFacesByImage",
      request.collectionId,
      options,
    );
    const image = await request.image.read(this.images, options);

    return new SimRekognitionFaceSearcher({
      collection,
      detection: this.faces.detectionFor(image),
      declared: this.faceMatches.matchesFor(image),
      request,
    }).search();
  }

  /**
   * Remove faces from a collection by id.
   */
  async delete(
    command: SimDeleteFacesCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimDeleteFacesCommandOutput> {
    const request = new DeleteFacesRequest(command.input);
    const collection = await this.reach(
      "rekognition:DeleteFaces",
      request.collectionId,
      options,
    );

    const removal = collection.faces.remove(request.faceIds);

    return {
      DeletedFaces: removal.removed,
      UnsuccessfulFaceDeletions: removal.missing.map((faceId) => ({
        FaceId: faceId,
        Reasons: [simRekognitionFaceNotFound],
      })),
      $metadata: {},
    };
  }

  /**
   * The collection an authorized request may work on.
   *
   * Authorizing before the collection is looked up is what keeps a denial and
   * a missing collection separate: a caller with no permission for a
   * collection never learns whether it is there.
   */
  private async reach(
    action: string,
    collectionId: string,
    options: SimRekognitionRequestOptions,
  ): Promise<SimRekognitionCollection> {
    this.authorizer.authorize(
      action,
      options,
      this.collections.arnFor(collectionId),
    );

    await this.background.sequence();

    return this.collections.require(collectionId);
  }
}
