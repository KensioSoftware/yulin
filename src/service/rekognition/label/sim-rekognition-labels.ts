import type { SimRekognitionImage } from "../image/sim-rekognition-image.js";
import { SimRekognitionResultRules } from "../rule/sim-rekognition-result-rules.js";
import type { SimRekognitionLabelsResult } from "./sim-rekognition-label-declaration.js";
import { SimRekognitionLabelDetection } from "./sim-rekognition-label-detection.js";
import { simRekognitionDefaultLabels } from "./sim-rekognition-label-defaults.js";

/**
 * The label results simulated Rekognition answers with.
 *
 * The rules are grouped per operation rather than hung off the service, so
 * `labels()` and the operation groups beside it each own the result shape
 * their own operation answers with.
 */
export class SimRekognitionLabels {
  private readonly rules =
    new SimRekognitionResultRules<SimRekognitionLabelDetection>(
      new SimRekognitionLabelDetection(simRekognitionDefaultLabels),
    );

  /**
   * Answer with this result for any image no other rule matches.
   */
  byDefault(result: SimRekognitionLabelsResult): void {
    this.rules.byDefault(new SimRekognitionLabelDetection(result));
  }

  /**
   * Answer with this result for the S3 object with this exact name.
   */
  onName(name: string, result: SimRekognitionLabelsResult): void {
    this.rules.onName(name, new SimRekognitionLabelDetection(result));
  }

  /**
   * Answer with this result for the image with this exact content hash.
   */
  onHash(hash: string, result: SimRekognitionLabelsResult): void {
    this.rules.onHash(hash, new SimRekognitionLabelDetection(result));
  }

  /**
   * The label result for one image.
   */
  detectionFor(image: SimRekognitionImage): SimRekognitionLabelDetection {
    return this.rules.resultFor(image);
  }
}
