import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimRekognitionAuthorizer } from "./command/authorize/sim-rekognition-authorizer.js";
import { DetectFacesHandler } from "./command/detect-faces/detect-faces.handler.js";
import type {
  SimDetectFacesCommand,
  SimDetectFacesCommandOutput,
} from "./command/detect-faces/detect-faces.command.js";
import { DetectLabelsHandler } from "./command/detect-labels/detect-labels.handler.js";
import type {
  SimDetectLabelsCommand,
  SimDetectLabelsCommandOutput,
} from "./command/detect-labels/detect-labels.command.js";
import { DetectModerationLabelsHandler } from "./command/detect-moderation-labels/detect-moderation-labels.handler.js";
import type {
  SimDetectModerationLabelsCommand,
  SimDetectModerationLabelsCommandOutput,
} from "./command/detect-moderation-labels/detect-moderation-labels.command.js";
import type { SimRekognitionRequestOptions } from "./command/sim-rekognition-request-options.js";
import { SimRekognitionFaces } from "./face/sim-rekognition-faces.js";
import {
  type SimRekognitionImageObjects,
  SimRekognitionUnreachableImageObjects,
} from "./image/sim-rekognition-image-objects.js";
import { SimRekognitionLabels } from "./label/sim-rekognition-labels.js";
import { SimRekognitionModeration } from "./moderation/sim-rekognition-moderation.js";
import { SimRekognitionSdkCommandRouter } from "./sdk/sim-rekognition-sdk-command-router.js";

interface SimRekognitionProperties {
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
  private readonly detectModerationLabelsCommand: DetectModerationLabelsHandler;
  private readonly detectLabelsCommand: DetectLabelsHandler;
  private readonly detectFacesCommand: DetectFacesHandler;
  private readonly sdkRouter = new SimRekognitionSdkCommandRouter(this);

  constructor(properties: SimRekognitionProperties = {}) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      images = new SimRekognitionUnreachableImageObjects(),
    } = properties;
    const authorizer = new SimRekognitionAuthorizer({ iam });

    this.detectModerationLabelsCommand = new DetectModerationLabelsHandler({
      moderation: this.moderationRules,
      authorizer,
      images,
      background,
    });

    this.detectLabelsCommand = new DetectLabelsHandler({
      labels: this.labelRules,
      authorizer,
      images,
      background,
    });

    this.detectFacesCommand = new DetectFacesHandler({
      faces: this.faceRules,
      authorizer,
      images,
      background,
    });
  }

  /**
   * The moderation results this simulated Rekognition answers with.
   *
   * Every image is clean until a rule says otherwise:
   *
   * ```typescript
   * simAws.rekognition().moderation().onName("nsfw.jpg", {
   *   labels: ["Explicit Nudity"],
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
   * simAws.rekognition().labels().onName("dog.jpg", {
   *   labels: [{ name: "Dog", parents: ["Animal", "Pet"] }],
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
    return await this.detectModerationLabelsCommand.handle(command, options);
  }

  /**
   * Handle a DetectLabels Command from the SDK.
   */
  async detectLabels(
    command: SimDetectLabelsCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDetectLabelsCommandOutput> {
    return await this.detectLabelsCommand.handle(command, options);
  }

  /**
   * Handle a DetectFaces Command from the SDK.
   */
  async detectFaces(
    command: SimDetectFacesCommand,
    options?: SimRekognitionRequestOptions,
  ): Promise<SimDetectFacesCommandOutput> {
    return await this.detectFacesCommand.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
