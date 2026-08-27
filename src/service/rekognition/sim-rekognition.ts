import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimRekognitionCollections } from "./collection/sim-rekognition-collections.js";
import { SimRekognitionFaceHandler } from "./command/face/face.handler.js";
import type {
  SimDeleteFacesCommand,
  SimDeleteFacesCommandOutput,
  SimIndexFacesCommand,
  SimIndexFacesCommandOutput,
  SimListFacesCommand,
  SimListFacesCommandOutput,
  SimSearchFacesByImageCommand,
  SimSearchFacesByImageCommandOutput,
} from "./command/face/face.command.js";
import { SimRekognitionCollectionHandler } from "./command/collection/collection.handler.js";
import type {
  SimCreateCollectionCommand,
  SimCreateCollectionCommandOutput,
  SimDeleteCollectionCommand,
  SimDeleteCollectionCommandOutput,
  SimListCollectionsCommand,
  SimListCollectionsCommandOutput,
} from "./command/collection/collection.command.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimRekognitionAuthorizer } from "./command/authorize/sim-rekognition-authorizer.js";
import type {
  SimDetectFacesCommand,
  SimDetectFacesCommandOutput,
} from "./command/detect-faces/detect-faces.command.js";
import type {
  SimDetectLabelsCommand,
  SimDetectLabelsCommandOutput,
} from "./command/detect-labels/detect-labels.command.js";
import type {
  SimDetectModerationLabelsCommand,
  SimDetectModerationLabelsCommandOutput,
} from "./command/detect-moderation-labels/detect-moderation-labels.command.js";
import { SimRekognitionDetectionHandlers } from "./command/sim-rekognition-detection-handlers.js";
import type { SimRekognitionRequestOptions } from "./command/sim-rekognition-request-options.js";
import { SimRekognitionFaces } from "./face/sim-rekognition-faces.js";
import {
  type SimRekognitionImageObjects,
  SimRekognitionUnreachableImageObjects,
} from "./image/sim-rekognition-image-objects.js";
import { SimRekognitionLabels } from "./label/sim-rekognition-labels.js";
import { SimRekognitionFaceMatches } from "./match/sim-rekognition-face-matches.js";
import { SimRekognitionModeration } from "./moderation/sim-rekognition-moderation.js";
import { SimRekognitionSdkCommandRouter } from "./sdk/sim-rekognition-sdk-command-router.js";

interface SimRekognitionProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly images?: SimRekognitionImageObjects;
}

/**
 * Simulated Rekognition. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * No image recognition happens here. Rekognition is a service where the
 * interesting behaviour is not the call but what the call returns, so the
 * simulation answers from results declared against images by name or by
 * content hash. A test says which image fails moderation and which does not,
 * and the system under test makes the same calls it would make against AWS.
 *
 * Results are declared per operation, through `moderation()`, so this facade
 * stays a facade as operations are added.
 */
export class SimRekognition {
  private readonly moderationRules = new SimRekognitionModeration();
  private readonly labelRules = new SimRekognitionLabels();
  private readonly faceRules = new SimRekognitionFaces();
  private readonly faceMatchRules = new SimRekognitionFaceMatches();
  private readonly detections: SimRekognitionDetectionHandlers;
  private readonly sdkRouter = new SimRekognitionSdkCommandRouter(this);
  private readonly collectionStore: SimRekognitionCollections;
  private readonly collectionCommands: SimRekognitionCollectionHandler;
  private readonly collectionFaceCommands: SimRekognitionFaceHandler;

  constructor(properties: SimRekognitionProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      images = new SimRekognitionUnreachableImageObjects(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);
    const authorizer = new SimRekognitionAuthorizer({ iam });

    this.collectionStore = new SimRekognitionCollections({
      accountRegionScope,
    });
    this.collectionCommands = new SimRekognitionCollectionHandler({
      collections: this.collectionStore,
      authorizer,
      background,
    });

    this.collectionFaceCommands = new SimRekognitionFaceHandler({
      collections: this.collectionStore,
      faces: this.faceRules,
      faceMatches: this.faceMatchRules,
      authorizer,
      images,
      background,
    });

    this.detections = new SimRekognitionDetectionHandlers({
      moderation: this.moderationRules,
      labels: this.labelRules,
      faces: this.faceRules,
      authorizer,
      images,
      background,
    });
  }

  /**
   * Handle a CreateCollectionCommand from the SDK.
   */
  async createCollection(
    command: SimCreateCollectionCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimCreateCollectionCommandOutput> {
    return await this.collectionCommands.create(command, options);
  }

  /**
   * Handle a ListCollectionsCommand from the SDK.
   */
  async listCollections(
    command: SimListCollectionsCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimListCollectionsCommandOutput> {
    return await this.collectionCommands.list(command, options);
  }

  /**
   * Handle a DeleteCollectionCommand from the SDK.
   */
  async deleteCollection(
    command: SimDeleteCollectionCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDeleteCollectionCommandOutput> {
    return await this.collectionCommands.delete(command, options);
  }

  /**
   * Handle an IndexFacesCommand from the SDK.
   */
  async indexFaces(
    command: SimIndexFacesCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimIndexFacesCommandOutput> {
    return await this.collectionFaceCommands.index(command, options);
  }

  /**
   * Handle a ListFacesCommand from the SDK.
   */
  async listFaces(
    command: SimListFacesCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimListFacesCommandOutput> {
    return await this.collectionFaceCommands.list(command, options);
  }

  /**
   * Handle a SearchFacesByImageCommand from the SDK.
   */
  async searchFacesByImage(
    command: SimSearchFacesByImageCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimSearchFacesByImageCommandOutput> {
    return await this.collectionFaceCommands.search(command, options);
  }

  /**
   * Handle a DeleteFacesCommand from the SDK.
   */
  async deleteFaces(
    command: SimDeleteFacesCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDeleteFacesCommandOutput> {
    return await this.collectionFaceCommands.delete(command, options);
  }

  /**
   * The moderation results this simulated Rekognition answers with.
   *
   * Every image is clean until a rule says otherwise:
   *
   * ```typescript
   * simAws.rekognition().moderation().onName("photo.jpg", {
   *   labels: ["Weapons"],
   * });
   * ```
   */
  moderation(): SimRekognitionModeration {
    return this.moderationRules;
  }

  /**
   * The label results this simulated Rekognition answers with.
   *
   * Every image gets the built-in default result until a rule says otherwise:
   *
   * ```typescript
   * simAws.rekognition().labels().onName("cat.jpg", {
   *   labels: [{ name: "Cat", parents: ["Animal", "Pet"] }],
   * });
   * ```
   */
  labels(): SimRekognitionLabels {
    return this.labelRules;
  }

  /**
   * The face results this simulated Rekognition answers with.
   *
   * Every image holds the built-in default face until a rule says otherwise:
   *
   * ```typescript
   * simAws.rekognition().faces().onName("landscape.jpg", { faces: [] });
   * ```
   */
  faces(): SimRekognitionFaces {
    return this.faceRules;
  }

  /**
   * The face searches this simulated Rekognition answers with.
   *
   * A search finds nobody until a rule says which indexed faces the image it
   * searched with finds:
   *
   * ```typescript
   * simAws.rekognition().faceMatches().onName("door/visitor.jpg", {
   *   matches: [{ externalImageId: "ada" }],
   * });
   * ```
   */
  faceMatches(): SimRekognitionFaceMatches {
    return this.faceMatchRules;
  }

  /**
   * Handle a DetectModerationLabels Command from the SDK.
   *
   * Background sequencing happens inside the command rather than here,
   * because the request is checked before it: a malformed request is a
   * malformed request whatever else the simulation has in flight.
   */
  async detectModerationLabels(
    command: SimDetectModerationLabelsCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDetectModerationLabelsCommandOutput> {
    return await this.detections.moderationLabels.handle(command, options);
  }

  /**
   * Handle a DetectLabels Command from the SDK.
   */
  async detectLabels(
    command: SimDetectLabelsCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDetectLabelsCommandOutput> {
    return await this.detections.labels.handle(command, options);
  }

  /**
   * Handle a DetectFaces Command from the SDK.
   */
  async detectFaces(
    command: SimDetectFacesCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDetectFacesCommandOutput> {
    return await this.detections.faces.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
