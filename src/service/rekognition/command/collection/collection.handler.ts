import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimRekognitionCollections } from "../../collection/sim-rekognition-collections.js";
import { requiredCollectionId } from "./collection-id.js";
import type { SimRekognitionAuthorizer } from "../authorize/sim-rekognition-authorizer.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";
import type {
  SimCreateCollectionCommand,
  SimCreateCollectionCommandOutput,
  SimDeleteCollectionCommand,
  SimDeleteCollectionCommandOutput,
  SimListCollectionsCommand,
  SimListCollectionsCommandOutput,
} from "./collection.command.js";

interface SimRekognitionCollectionHandlerProperties {
  readonly collections: SimRekognitionCollections;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * The simulated Rekognition operations that work on a face collection.
 *
 * The three share a store and an authorization shape, so they are handled
 * together rather than one class each. Unlike the detections, a collection has
 * an ARN, so each authorizes against that rather than against a wildcard, and
 * a policy naming one collection reaches only that collection.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/CreateCollectionCommand/
 */
export class SimRekognitionCollectionHandler {
  private readonly collections: SimRekognitionCollections;
  private readonly authorizer: SimRekognitionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimRekognitionCollectionHandlerProperties) {
    this.collections = properties.collections;
    this.authorizer = properties.authorizer;
    this.background = properties.background;
  }

  /**
   * Create a face collection.
   */
  async create(
    command: SimCreateCollectionCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimCreateCollectionCommandOutput> {
    const collectionId = requiredCollectionId(command.input.CollectionId);

    this.authorizer.authorize(
      "rekognition:CreateCollection",
      options,
      this.collections.arnFor(collectionId),
    );

    await this.background.sequence();

    const collection = this.collections.create(
      collectionId,
      this.background.now(),
    );

    return {
      StatusCode: 200,
      CollectionArn: collection.arn,
      FaceModelVersion: collection.faceModelVersion,
      $metadata: {},
    };
  }

  /**
   * List the face collections this Account and Region holds.
   */
  async list(
    _command: SimListCollectionsCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimListCollectionsCommandOutput> {
    // A listing reads every collection, so it authorizes against all of them
    // rather than against one, as real Rekognition does.
    this.authorizer.authorize("rekognition:ListCollections", options);

    await this.background.sequence();

    const held = this.collections.all();

    return {
      CollectionIds: held.map((collection) => collection.collectionId),
      FaceModelVersions: held.map((collection) => collection.faceModelVersion),
      $metadata: {},
    };
  }

  /**
   * Remove a face collection.
   */
  async delete(
    command: SimDeleteCollectionCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDeleteCollectionCommandOutput> {
    const collectionId = requiredCollectionId(command.input.CollectionId);

    this.authorizer.authorize(
      "rekognition:DeleteCollection",
      options,
      this.collections.arnFor(collectionId),
    );

    await this.background.sequence();

    this.collections.remove(collectionId);

    return { StatusCode: 200, $metadata: {} };
  }
}
