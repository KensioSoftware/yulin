import {
  type SimRekognitionImageRequest,
  SimRekognitionImageRequests,
} from "../../image/sim-rekognition-image-request.js";
import { SimRekognitionMinConfidence } from "../sim-rekognition-min-confidence.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import type { SimDetectModerationLabelsCommandInput } from "./detect-moderation-labels.command.js";

/**
 * The confidence real Rekognition filters moderation labels at when a request
 * does not say. Content moderation uses 50 here, which is not the 55 label
 * detection uses.
 */
const minConfidence = new SimRekognitionMinConfidence(50);

const operation = "DetectModerationLabels";
const acceptedInput = ["Image", "MinConfidence"];

/**
 * A DetectModerationLabels request, checked before anything acts on it.
 *
 * `HumanLoopConfig` and `ProjectVersion` are refused here rather than ignored.
 * A request naming a custom moderation adapter through `ProjectVersion` would
 * otherwise be answered by the built-in model, which is the failure that looks
 * like a pass: the adapter would appear applied here and be applied for real
 * in production.
 */
export class DetectModerationLabelsRequest {
  public readonly image: SimRekognitionImageRequest;
  public readonly minConfidence: number;

  constructor(input: SimDetectModerationLabelsCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.image = new SimRekognitionImageRequests(operation).parse(input.Image);
    this.minConfidence = minConfidence.of(input.MinConfidence);
  }
}
