import { simRekognitionImageHash } from "../image/sim-rekognition-image-hash.js";

/**
 * One image that ships with simulated Rekognition.
 *
 * The bytes are held as base64 in the source rather than as a file beside it,
 * so a sample image is the same bytes in the published package as in this
 * repository, and reading one needs no filesystem.
 *
 * The hash is taken once, when the image is made, because it is what the
 * built-in rules are registered against.
 */
export class SimRekognitionSampleImage {
  /**
   * The content hash of this image, which is the hash a rule matches it by.
   */
  public readonly hash: string;

  private readonly image: Uint8Array;

  constructor(base64: string) {
    this.image = Uint8Array.from(Buffer.from(base64, "base64"));
    this.hash = simRekognitionImageHash(this.image);
  }

  /**
   * The bytes of this image.
   *
   * A copy, so a caller that writes into what it uploaded cannot change what
   * the next caller gets and leave the built-in rule matching nothing.
   */
  bytes(): Uint8Array {
    return Uint8Array.from(this.image);
  }
}
