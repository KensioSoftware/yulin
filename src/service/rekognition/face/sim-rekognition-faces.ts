import type { SimRekognitionImage } from "../image/sim-rekognition-image.js";
import { SimRekognitionResultRules } from "../rule/sim-rekognition-result-rules.js";
import { simRekognitionSampleFaceRules } from "../sample/sim-rekognition-sample-rules.js";
import type { SimRekognitionFacesResult } from "./sim-rekognition-face-declaration.js";
import { SimRekognitionFaceDetection } from "./sim-rekognition-face-detection.js";
import { simRekognitionDefaultFaces } from "./sim-rekognition-face-defaults.js";

/**
 * The face results simulated Rekognition answers with.
 *
 * The rules are grouped per operation rather than hung off the service, so
 * `faces()` and the operation groups beside it each own the result shape their
 * own operation answers with.
 */
export class SimRekognitionFaces {
  private readonly rules =
    new SimRekognitionResultRules<SimRekognitionFaceDetection>(
      new SimRekognitionFaceDetection(simRekognitionDefaultFaces),
    );

  /**
   * The sample images are declared as ordinary hash rules, so a rule a test
   * registers for the same image replaces the built-in one through the usual
   * precedence rather than through anything special-cased here.
   */
  constructor() {
    for (const sample of simRekognitionSampleFaceRules) {
      this.onHash(sample.image.hash, sample.result);
    }
  }

  /**
   * Answer with this result for any image no other rule matches.
   */
  byDefault(result: SimRekognitionFacesResult): void {
    this.rules.byDefault(new SimRekognitionFaceDetection(result));
  }

  /**
   * Answer with this result for the S3 object with this exact name.
   */
  onName(name: string, result: SimRekognitionFacesResult): void {
    this.rules.onName(name, new SimRekognitionFaceDetection(result));
  }

  /**
   * Answer with this result for the image with this exact content hash.
   */
  onHash(hash: string, result: SimRekognitionFacesResult): void {
    this.rules.onHash(hash, new SimRekognitionFaceDetection(result));
  }

  /**
   * The face result for one image.
   */
  detectionFor(image: SimRekognitionImage): SimRekognitionFaceDetection {
    return this.rules.resultFor(image);
  }
}
