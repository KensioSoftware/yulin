import { SimDeclaredResultRules } from "../../../util/rule/sim-declared-result-rules.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import { isSimRekognitionImageHash } from "../image/sim-rekognition-image-hash.js";
import type { SimRekognitionImage } from "../image/sim-rekognition-image.js";

/**
 * The results one detection operation answers with, by image.
 *
 * Simulated Rekognition does no image recognition. Every operation answers
 * from the rules registered against it, in the way simulated ACM issues
 * certificates without producing real TLS certificates.
 *
 * There are three kinds of rule and one order between them: a rule for an
 * exact content hash wins, then a rule for an exact S3 object name, then the
 * default. That ordering is `SimDeclaredResultRules`, which simulated
 * Personalize matches recommendation requests with too. What is Rekognition's
 * own is which key each tier holds and what makes one well formed.
 *
 * An image passed as `Image.Bytes` has no name, so it consults hash rules and
 * then the default.
 */
export class SimRekognitionResultRules<TResult> {
  private readonly rules: SimDeclaredResultRules<TResult>;

  constructor(defaultResult: TResult) {
    this.rules = new SimDeclaredResultRules<TResult>(defaultResult);
  }

  /**
   * Answer with this result for any image no other rule matches.
   */
  byDefault(result: TResult): void {
    this.rules.byDefault(result);
  }

  /**
   * Answer with this result for an image read from an S3 object with this
   * exact name.
   *
   * The name is the `Name` a request gives Rekognition, which is the object
   * key. It is matched on its own rather than with the Bucket, so a rule for
   * a key applies to that key in whichever Bucket the request names.
   */
  onName(name: string, result: TResult): void {
    if (name.length === 0) {
      throw new SimRekognitionDeclarationError(
        "A simulated Rekognition name rule needs an S3 object name to match",
      );
    }

    this.rules.onTrailingKey(name, result);
  }

  /**
   * Answer with this result for an image whose bytes have this exact content
   * hash.
   *
   * This is the rule for a system that generates its own object keys, where
   * the name is not something a test can usefully match on. The hash is the
   * sha256 digest of the image bytes as lowercase hex, which
   * `simRekognitionImageHash` produces from a fixture.
   */
  onHash(hash: string, result: TResult): void {
    const digest = hash.toLowerCase();

    if (!isSimRekognitionImageHash(digest)) {
      throw new SimRekognitionDeclarationError(
        `'${hash}' is not a simulated Rekognition image hash. A hash rule ` +
          `matches a sha256 digest of the image bytes, as 64 hex ` +
          `characters, which simRekognitionImageHash produces.`,
      );
    }

    this.rules.onLeadingKey(digest, result);
  }

  /**
   * The result for one image.
   */
  resultFor(image: SimRekognitionImage): TResult {
    return this.rules.resultFor({
      leading: image.hash(),
      trailing: image.name,
    });
  }
}
