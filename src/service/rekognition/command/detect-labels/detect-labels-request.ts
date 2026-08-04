import {
  SimRekognitionInvalidParameterException,
  SimRekognitionUnsimulatedInputException,
} from "../../error/sim-rekognition.error.js";
import {
  type SimRekognitionImageRequest,
  SimRekognitionImageRequests,
} from "../../image/sim-rekognition-image-request.js";
import { SimRekognitionMinConfidence } from "../sim-rekognition-min-confidence.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import type { SimDetectLabelsCommandInput } from "./detect-labels.command.js";

/**
 * The confidence real Rekognition filters labels at when a request does not
 * say. Label detection uses 55 here, which is not the 50 content moderation
 * uses.
 */
const minConfidence = new SimRekognitionMinConfidence(55);

const operation = "DetectLabels";
const acceptedInput = ["Image", "MaxLabels", "MinConfidence", "Features"];

const generalLabels = "GENERAL_LABELS";
const imageProperties = "IMAGE_PROPERTIES";

/**
 * A DetectLabels request, checked before anything acts on it.
 *
 * `Settings` is refused with everything else this simulation does not model,
 * because its filters decide which labels a response carries: applying none of
 * them would answer with labels a real caller asked to have left out.
 */
export class DetectLabelsRequest {
  public readonly image: SimRekognitionImageRequest;
  public readonly minConfidence: number;
  public readonly maxLabels: number | undefined;

  constructor(input: SimDetectLabelsCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );
    DetectLabelsRequest.refuseUnsimulatedFeatures(input.Features);

    this.image = new SimRekognitionImageRequests(operation).parse(input.Image);
    this.minConfidence = minConfidence.of(input.MinConfidence);
    this.maxLabels = DetectLabelsRequest.maxLabelsOf(input.MaxLabels);
  }

  /**
   * The most labels this request wants back, if it said.
   *
   * There is no cap when the request left it out, so an explicit `0` asks for
   * no labels rather than being read as unset.
   */
  private static maxLabelsOf(
    requested: number | undefined,
  ): number | undefined {
    if (requested === undefined) {
      return undefined;
    }

    if (!Number.isSafeInteger(requested) || requested < 0) {
      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: MaxLabels of ${String(requested)} ` +
          `is not a whole number of labels from 0 upwards`,
      );
    }

    return requested;
  }

  /**
   * Refuse the response members this simulation cannot fill in.
   *
   * `GENERAL_LABELS` is the whole of what is simulated, and it is what a
   * request asking for no features gets, here as on AWS.
   */
  private static refuseUnsimulatedFeatures(
    requested: readonly string[] | undefined,
  ): void {
    const features = requested ?? [];

    for (const feature of features) {
      if (feature === generalLabels) {
        continue;
      }

      if (feature === imageProperties) {
        throw new SimRekognitionUnsimulatedInputException(
          `${operation} ${imageProperties} is not simulated: nothing here ` +
            `looks at the image, so the quality and dominant colours a ` +
            `response carries would be invented rather than measured`,
        );
      }

      throw new SimRekognitionInvalidParameterException(
        `Request has invalid parameters: Features of ${feature} is neither ` +
          `${generalLabels} nor ${imageProperties}`,
      );
    }
  }
}
