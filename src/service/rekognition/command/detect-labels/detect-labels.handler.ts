import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimRekognitionImageObjects } from "../../image/sim-rekognition-image-objects.js";
import type { SimRekognitionLabels } from "../../label/sim-rekognition-labels.js";
import { simRekognitionLabelModelVersion } from "../../label/sim-rekognition-label-defaults.js";
import type { SimRekognitionAuthorizer } from "../authorize/sim-rekognition-authorizer.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";
import { DetectLabelsRequest } from "./detect-labels-request.js";
import type {
  SimDetectLabelsCommand,
  SimDetectLabelsCommandOutput,
} from "./detect-labels.command.js";

const action = "rekognition:DetectLabels";

interface DetectLabelsHandlerProperties {
  readonly labels: SimRekognitionLabels;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly images: SimRekognitionImageObjects;
  readonly background: BackgroundScheduler;
}

/**
 * Handles a DetectLabels command.
 *
 * The steps are in the same order as the other detections. The request is
 * checked first, so a malformed one fails the same way whatever else the
 * simulation is doing. The caller is then authorized for the Rekognition
 * action before the image is read, so a caller without
 * `rekognition:DetectLabels` is told about that rather than about an S3
 * object. Only then is the image read, as the caller, and the rules consulted.
 */
export class DetectLabelsHandler {
  private readonly labels: SimRekognitionLabels;
  private readonly authorizer: SimRekognitionAuthorizer;
  private readonly images: SimRekognitionImageObjects;
  private readonly background: BackgroundScheduler;

  constructor(properties: DetectLabelsHandlerProperties) {
    this.labels = properties.labels;
    this.authorizer = properties.authorizer;
    this.images = properties.images;
    this.background = properties.background;
  }

  /**
   * Detect the labels an image is declared to have.
   */
  async handle(
    command: SimDetectLabelsCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimDetectLabelsCommandOutput> {
    const request = new DetectLabelsRequest(command.input);

    await this.background.sequence();

    this.authorizer.authorize(action, options);

    const image = await request.image.read(this.images, options);
    const detection = this.labels.detectionFor(image);

    return {
      Labels: detection.labelsFor(request),
      LabelModelVersion: simRekognitionLabelModelVersion,
      $metadata: {},
    };
  }
}
