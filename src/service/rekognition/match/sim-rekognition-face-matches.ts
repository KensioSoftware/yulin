import type { SimRekognitionImage } from "../image/sim-rekognition-image.js";
import { SimRekognitionResultRules } from "../rule/sim-rekognition-result-rules.js";
import type { SimRekognitionFaceMatchesResult } from "./sim-rekognition-face-match-declaration.js";
import { SimRekognitionFaceMatchResult } from "./sim-rekognition-face-match-result.js";

/**
 * The face search results simulated Rekognition answers with.
 *
 * Nothing here compares one face with another, so which indexed faces a search
 * image finds is declared the same way every other Rekognition result is: by
 * the name of the S3 object searched with, by the hash of its bytes, or as the
 * answer for anything else. An image no rule matches finds nobody, because a
 * search that invented a match would pass a test the application would fail.
 */
export class SimRekognitionFaceMatches {
  private readonly rules =
    new SimRekognitionResultRules<SimRekognitionFaceMatchResult>(
      new SimRekognitionFaceMatchResult({ matches: [] }),
    );

  /**
   * Answer with these matches for any image no other rule matches.
   */
  byDefault(result: SimRekognitionFaceMatchesResult): void {
    this.rules.byDefault(new SimRekognitionFaceMatchResult(result));
  }

  /**
   * Answer with these matches for the S3 object with this exact name.
   */
  onName(name: string, result: SimRekognitionFaceMatchesResult): void {
    this.rules.onName(name, new SimRekognitionFaceMatchResult(result));
  }

  /**
   * Answer with these matches for the image with this exact content hash.
   */
  onHash(hash: string, result: SimRekognitionFaceMatchesResult): void {
    this.rules.onHash(hash, new SimRekognitionFaceMatchResult(result));
  }

  /**
   * The matches declared for one search image.
   */
  matchesFor(image: SimRekognitionImage): SimRekognitionFaceMatchResult {
    return this.rules.resultFor(image);
  }
}
