import { SimKmsInvalidCiphertextException } from "../error/sim-kms.error.js";

/**
 * Marks a byte string as one of this simulation's ciphertext blobs, so that
 * arbitrary bytes handed to Decrypt are rejected rather than misread as a
 * short blob.
 */
const magic = Buffer.from("YULINKMS", "ascii");

/**
 * Blob layout version, so a future change to the layout can be told apart
 * from a blob this simulation cannot read at all.
 */
const version = 1;

const ivLength = 12;
const authTagLength = 16;

interface SimKmsCiphertextBlobPartsProperties {
  readonly keyArn: string;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/**
 * The parts of one ciphertext blob.
 */
export class SimKmsCiphertextBlobParts {
  public readonly keyArn: string;
  public readonly iv: Uint8Array;
  public readonly authTag: Uint8Array;
  public readonly ciphertext: Uint8Array;

  constructor(properties: SimKmsCiphertextBlobPartsProperties) {
    this.keyArn = properties.keyArn;
    this.iv = properties.iv;
    this.authTag = properties.authTag;
    this.ciphertext = properties.ciphertext;
  }
}

/**
 * Encodes and decodes the opaque ciphertext blob KMS hands back.
 *
 * Real KMS blobs are opaque to the caller but not to KMS: a blob names the key
 * that produced it, which is why Decrypt needs no KeyId for a symmetric key.
 * This layout keeps that property, carrying the key ARN alongside the AES-GCM
 * initialisation vector and authentication tag.
 *
 * Opaque means callers must not read it. It is not encrypted, and it is not
 * portable to real AWS or between simulations.
 */
export class SimKmsCiphertextBlob {
  /**
   * Encode the parts of an encryption into one blob.
   */
  encode(parts: SimKmsCiphertextBlobParts): Uint8Array {
    const keyArn = Buffer.from(parts.keyArn, "utf8");
    const header = Buffer.alloc(2);
    header.writeUInt8(version, 0);
    header.writeUInt8(keyArn.length, 1);

    return Uint8Array.from(
      Buffer.concat([
        magic,
        header,
        keyArn,
        parts.iv,
        parts.authTag,
        parts.ciphertext,
      ]),
    );
  }

  /**
   * Read the parts back out of a blob.
   *
   * Anything that is not a blob this simulation produced is an invalid
   * ciphertext, which is the same answer real KMS gives for bytes it cannot
   * make sense of.
   */
  decode(blob: Uint8Array): SimKmsCiphertextBlobParts {
    const buffer = Buffer.from(blob);
    const keyArnStart = magic.length + 2;

    if (
      buffer.length < keyArnStart ||
      !buffer.subarray(0, magic.length).equals(magic) ||
      buffer.readUInt8(magic.length) !== version
    ) {
      throw new SimKmsInvalidCiphertextException();
    }

    const keyArnLength = buffer.readUInt8(magic.length + 1);
    const ivStart = keyArnStart + keyArnLength;
    const authTagStart = ivStart + ivLength;
    const ciphertextStart = authTagStart + authTagLength;

    if (buffer.length < ciphertextStart) {
      throw new SimKmsInvalidCiphertextException();
    }

    return new SimKmsCiphertextBlobParts({
      keyArn: buffer.subarray(keyArnStart, ivStart).toString("utf8"),
      iv: Uint8Array.from(buffer.subarray(ivStart, authTagStart)),
      authTag: Uint8Array.from(buffer.subarray(authTagStart, ciphertextStart)),
      ciphertext: Uint8Array.from(buffer.subarray(ciphertextStart)),
    });
  }
}
