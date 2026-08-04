import type { SimRekognitionImage } from "../image/sim-rekognition-image.js";
import { SimRekognitionResultRules } from "../rule/sim-rekognition-result-rules.js";
import { simRekognitionSampleModerationRules } from "../sample/sim-rekognition-sample-rules.js";
import {
  SimRekognitionModerationDetection,
  type SimRekognitionModerationResult,
} from "./sim-rekognition-moderation-result.js";

/**
 * What DetectModerationLabels answers with before anything is configured.
 *
 * A clean image is the useful default: a moderation pipeline is mostly
 * exercised by images that pass, with the ones that fail declared image by
 * image. Which images those are is a decision about the system under test, so
 * the simulation does not invent one.
 */
const cleanImage: SimRekognitionModerationResult = { labels: [] };

/**
 * The moderation results simulated Rekognition answers with.
 *
 * The rules are grouped per operation rather than hung off the service, so
 * `moderation()`, and the operation groups added beside it, each own the
 * result shape their own operation answers with.
 */
export class SimRekognitionModeration {
  private readonly rules =
    new SimRekognitionResultRules<SimRekognitionModerationDetection>(
      new SimRekognitionModerationDetection(cleanImage),
    );

  /**
   * The sample images are declared as ordinary hash rules, so a rule a test
   * registers for the same image replaces the built-in one through the usual
   * precedence rather than through anything special-cased here.
   */
  constructor() {
    for (const sample of simRekognitionSampleModerationRules) {
      this.onHash(sample.image.hash, sample.result);
    }
  }

  /**
   * Answer with this result for any image no other rule matches.
   */
  byDefault(result: SimRekognitionModerationResult): void {
    this.rules.byDefault(new SimRekognitionModerationDetection(result));
  }

  /**
   * Answer with this result for the S3 object with this exact name.
   */
  onName(name: string, result: SimRekognitionModerationResult): void {
    this.rules.onName(name, new SimRekognitionModerationDetection(result));
  }

  /**
   * Answer with this result for the image with this exact content hash.
   */
  onHash(hash: string, result: SimRekognitionModerationResult): void {
    this.rules.onHash(hash, new SimRekognitionModerationDetection(result));
  }

  /**
   * The moderation result for one image.
   */
  detectionFor(image: SimRekognitionImage): SimRekognitionModerationDetection {
    return this.rules.resultFor(image);
  }
}
