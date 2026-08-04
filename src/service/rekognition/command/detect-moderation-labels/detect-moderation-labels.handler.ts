import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimRekognitionImageObjects } from "../../image/sim-rekognition-image-objects.js";
import type { SimRekognitionModeration } from "../../moderation/sim-rekognition-moderation.js";
import { simRekognitionModerationModelVersion } from "../../moderation/sim-rekognition-moderation-taxonomy.js";
import type { SimRekognitionAuthorizer } from "../authorize/sim-rekognition-authorizer.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";
import { DetectModerationLabelsRequest } from "./detect-moderation-labels-request.js";
import type {
  SimDetectModerationLabelsCommand,
  SimDetectModerationLabelsCommandOutput,
} from "./detect-moderation-labels.command.js";

const action = "rekognition:DetectModerationLabels";

interface DetectModerationLabelsHandlerProperties {
  readonly moderation: SimRekognitionModeration;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly images: SimRekognitionImageObjects;
  readonly background: BackgroundScheduler;
}

/**
 * Handles a DetectModerationLabels command.
 *
 * The order of the steps is the point of this class. The request is checked
 * first, so a malformed one fails the same way whatever else the simulation is
 * doing. The caller is then authorized for the Rekognition action before the
 * image is read, so a caller without `rekognition:DetectModerationLabels` is
 * told about that rather than about an S3 object, and goes looking at the
 * right policy. Only then is the image read, as the caller, and the rules
 * consulted.
 */
export class DetectModerationLabelsHandler {
  private readonly moderation: SimRekognitionModeration;
  private readonly authorizer: SimRekognitionAuthorizer;
  private readonly images: SimRekognitionImageObjects;
  private readonly background: BackgroundScheduler;

  constructor(properties: DetectModerationLabelsHandlerProperties) {
    this.moderation = properties.moderation;
    this.authorizer = properties.authorizer;
    this.images = properties.images;
    this.background = properties.background;
  }

  /**
   * Detect the moderation labels an image is declared to have.
   */
  async handle(
    command: SimDetectModerationLabelsCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimDetectModerationLabelsCommandOutput> {
    const request = new DetectModerationLabelsRequest(command.input);

    await this.background.sequence();

    this.authorizer.authorize(action, options);

    const image = await request.image.read(this.images, options);
    const detection = this.moderation.detectionFor(image);

    return {
      ModerationLabels: detection.labelsAbove(request.minConfidence),
      ModerationModelVersion: simRekognitionModerationModelVersion,
      // A photograph is neither animated nor illustrated, and comes back with
      // an empty list. Simulated Rekognition does not look at the image, so it
      // has nothing to say here and says nothing, which is what a photograph
      // would get. Each response gets its own array rather than sharing one.
      ContentTypes: [],
      $metadata: {},
    };
  }
}
