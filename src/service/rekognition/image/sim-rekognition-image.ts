import {
  simRekognitionImageFormat,
  type SimRekognitionImageFormatName,
} from "./sim-rekognition-image-format.js";
import { simRekognitionImageHash } from "./sim-rekognition-image-hash.js";

interface SimRekognitionImageProperties {
  readonly bytes: Uint8Array;
  readonly name?: string | undefined;
}

/**
 * An image a detection operation was given, as the thing a rule matches
 * against.
 *
 * An image has a name only when the request named an S3 object, since bytes
 * passed straight to the operation have nothing to be called. Both always have
 * a content hash, which is why a hash rule is the one that reaches every
 * image.
 *
 * The format is decided when the image is made, so bytes that are not an image
 * are refused before any rule is consulted.
 */
export class SimRekognitionImage {
  public readonly bytes: Uint8Array;
  public readonly name: string | undefined;
  public readonly format: SimRekognitionImageFormatName;

  private hashDigest: string | undefined;

  constructor(properties: SimRekognitionImageProperties) {
    // The bytes are copied rather than kept, so an image is the bytes as they
    // were received. A caller reading into a reused buffer would otherwise
    // change the hash of an image that has already been detected on.
    this.bytes = new Uint8Array(properties.bytes);
    this.name = properties.name;
    this.format = simRekognitionImageFormat(this.bytes);
  }

  /**
   * The sha256 hash of this image's bytes, as lowercase hex.
   */
  hash(): string {
    this.hashDigest ??= simRekognitionImageHash(this.bytes);

    return this.hashDigest;
  }
}
