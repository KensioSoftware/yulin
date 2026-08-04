import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";
import {
  parseSimRekognitionImageRequest,
  type SimRekognitionImageRequest,
} from "../../image/sim-rekognition-image-request.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import type { SimDetectModerationLabelsCommandInput } from "./detect-moderation-labels.command.js";

/**
 * The confidence real Rekognition filters moderation labels at when a request
 * does not say. Content moderation uses 50 here, which is not the 55 label
 * detection uses.
 */
const defaultMinConfidence = 50;

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

    this.image = parseSimRekognitionImageRequest(input.Image);
    this.minConfidence = DetectModerationLabelsRequest.confidenceOf(input);
  }

  /**
   * The minimum confidence this request filters at.
   *
   * The default is applied only when the request left it out, so an explicit
   * `0` asks for every label rather than being promoted to 50.
   */
  private static confidenceOf(
    input: SimDetectModerationLabelsCommandInput,
  ): number {
    if (input.MinConfidence === undefined) {
      return defaultMinConfidence;
    }

    // A NaN is refused here rather than compared against. Every comparison
    // with one is false, so it would filter every label out and look like an
    // image with nothing to report.
    if (
      !Number.isFinite(input.MinConfidence) ||
      input.MinConfidence < 0 ||
      input.MinConfidence > 100
    ) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: MinConfidence of ` +
          `${String(input.MinConfidence)} is not a percentage from 0 to 100`,
      );
    }

    return input.MinConfidence;
  }
}
