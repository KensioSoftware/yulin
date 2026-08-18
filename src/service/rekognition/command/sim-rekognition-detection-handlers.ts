import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimRekognitionFaces } from "../face/sim-rekognition-faces.js";
import type { SimRekognitionImageObjects } from "../image/sim-rekognition-image-objects.js";
import type { SimRekognitionLabels } from "../label/sim-rekognition-labels.js";
import type { SimRekognitionModeration } from "../moderation/sim-rekognition-moderation.js";
import type { SimRekognitionAuthorizer } from "./authorize/sim-rekognition-authorizer.js";
import { DetectFacesHandler } from "./detect-faces/detect-faces.handler.js";
import { DetectLabelsHandler } from "./detect-labels/detect-labels.handler.js";
import { DetectModerationLabelsHandler } from "./detect-moderation-labels/detect-moderation-labels.handler.js";

interface SimRekognitionDetectionHandlersProperties {
  readonly moderation: SimRekognitionModeration;
  readonly labels: SimRekognitionLabels;
  readonly faces: SimRekognitionFaces;
  readonly authorizer: SimRekognitionAuthorizer;
  readonly images: SimRekognitionImageObjects;
  readonly background: BackgroundScheduler;
}

/**
 * The three operations that answer what is in one image.
 *
 * They differ only in the rules they read, so they are built together and the
 * facade holds one of these rather than three handlers and the same four
 * collaborators three times over.
 */
export class SimRekognitionDetectionHandlers {
  public readonly moderationLabels: DetectModerationLabelsHandler;
  public readonly labels: DetectLabelsHandler;
  public readonly faces: DetectFacesHandler;

  constructor(properties: SimRekognitionDetectionHandlersProperties) {
    const { authorizer, images, background } = properties;

    this.moderationLabels = new DetectModerationLabelsHandler({
      moderation: properties.moderation,
      authorizer,
      images,
      background,
    });
    this.labels = new DetectLabelsHandler({
      labels: properties.labels,
      authorizer,
      images,
      background,
    });
    this.faces = new DetectFacesHandler({
      faces: properties.faces,
      authorizer,
      images,
      background,
    });
  }
}
