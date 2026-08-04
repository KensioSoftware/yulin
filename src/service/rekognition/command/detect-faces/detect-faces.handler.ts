import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimRekognitionFaces } from "../../face/sim-rekognition-faces.js";
import type { SimRekognitionImageObjects } from "../../image/sim-rekognition-image-objects.js";
import type { SimRekognitionAuthorizer } from "../authorize/sim-rekognition-authorizer.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";
import { DetectFacesRequest } from "./detect-faces-request.js";
import type {
  SimDetectFacesCommand,
  SimDetectFacesCommandOutput,
} from "./detect-faces.command.js";

const action = "rekognition:DetectFaces";

interface DetectFacesHandlerProperties {
  readonly faces: SimRekognitionFaces;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly images: SimRekognitionImageObjects;
  readonly background: BackgroundScheduler;
}

/**
 * Handles a DetectFaces command.
 *
 * The steps are in the same order as the other detections. The request is
 * checked first, so a malformed one fails the same way whatever else the
 * simulation is doing. The caller is then authorized for the Rekognition
 * action before the image is read, so a caller without
 * `rekognition:DetectFaces` is told about that rather than about an S3 object.
 * Only then is the image read, as the caller, and the rules consulted.
 */
export class DetectFacesHandler {
  private readonly faces: SimRekognitionFaces;
  private readonly authorizer: SimRekognitionAuthorizer;
  private readonly images: SimRekognitionImageObjects;
  private readonly background: BackgroundScheduler;

  constructor(properties: DetectFacesHandlerProperties) {
    this.faces = properties.faces;
    this.authorizer = properties.authorizer;
    this.images = properties.images;
    this.background = properties.background;
  }

  /**
   * Detect the faces an image is declared to hold.
   */
  async handle(
    command: SimDetectFacesCommand,
    options: SimRekognitionRequestOptions = {},
  ): Promise<SimDetectFacesCommandOutput> {
    const request = new DetectFacesRequest(command.input);

    await this.background.sequence();

    this.authorizer.authorize(action, options);

    const image = await request.image.read(this.images, options);
    const detection = this.faces.detectionFor(image);

    return {
      FaceDetails: detection.detailsFor(request.attributes),
      $metadata: {},
    };
  }
}
