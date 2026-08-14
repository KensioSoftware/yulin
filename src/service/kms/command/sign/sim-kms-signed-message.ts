import { SimKmsValidationException } from "../../error/sim-kms.error.js";

const rawMessageType = "RAW";

/**
 * The largest message Sign and Verify accept.
 *
 * Real KMS takes 4096 bytes for a RAW message, which is the limit that pushes
 * a caller signing something larger towards hashing it first.
 */
const maxMessageBytes = 4096;

/**
 * The largest signature Verify accepts, which is what an RSA_4096 signature
 * needs room for.
 */
const maxSignatureBytes = 6144;

/**
 * Reads the message a Sign or Verify request carries.
 *
 * `MessageType: DIGEST` is refused rather than answered. Node has no way to
 * sign a digest that has already been computed: `crypto.sign` with no
 * algorithm hashes what it is given rather than signing it, so the signature
 * would not be the one real KMS makes and would not verify against the message
 * anywhere outside this simulation. A wrong signature that passes here is the
 * worst outcome available, so this fails closed.
 */
export class SimKmsSignedMessage {
  /**
   * The message bytes to sign or verify.
   */
  require(
    message: Uint8Array | undefined,
    messageType: string | undefined,
  ): Uint8Array {
    this.requireRawMessageType(messageType);

    if (message === undefined || message.length === 0) {
      throw new SimKmsValidationException("Message is required");
    }

    if (message.length > maxMessageBytes) {
      throw new SimKmsValidationException(
        `Message of ${String(message.length)} bytes exceeds the ${String(maxMessageBytes)} byte limit`,
      );
    }

    return message;
  }

  /**
   * The signature bytes to check.
   *
   * A missing signature is a request AWS refuses before it does any
   * cryptography, so it fails as validation here rather than as a signature
   * that did not verify. The two mean different things to a caller.
   */
  requireSignature(signature: Uint8Array | undefined): Uint8Array {
    if (signature === undefined || signature.length === 0) {
      throw new SimKmsValidationException("Signature is required");
    }

    if (signature.length > maxSignatureBytes) {
      throw new SimKmsValidationException(
        `Signature of ${String(signature.length)} bytes exceeds the ${String(maxSignatureBytes)} byte limit`,
      );
    }

    return signature;
  }

  private requireRawMessageType(messageType: string | undefined): void {
    if (messageType === undefined || messageType === rawMessageType) {
      return;
    }

    throw new SimKmsValidationException(
      `MessageType '${messageType}' is not simulated: simulated KMS signs ${rawMessageType} messages, and hashes them itself`,
    );
  }
}
