import { createHash } from "node:crypto";
import { SimSecretsManagerInvalidParameterException } from "../error/sim-secrets-manager.error.js";

/**
 * The two ways a Secrets Manager request can carry a secret value.
 */
export interface SimSecretsManagerSecretValueInput {
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
}

/**
 * The markers that tell the two kinds of value apart once a value is bytes.
 *
 * A value is encrypted as bytes, and what comes back out has to say which of
 * SecretString and SecretBinary it was, since the two are different fields on
 * the way out and a caller storing UTF-8 bytes as binary must not get text
 * back.
 */
const textMarker = 0;
const binaryMarker = 1;

/**
 * The value held by one version of a simulated secret.
 *
 * Real Secrets Manager stores either text or binary and never both, and hands
 * back whichever one it stored. Holding one content field rather than two
 * optional ones keeps that invariant true by construction, so no reader has to
 * cope with a value that is somehow neither.
 */
export class SimSecretsManagerSecretValue {
  private readonly content: string | Uint8Array;

  private constructor(content: string | Uint8Array) {
    this.content = content;
  }

  /**
   * Read a value from request input, refusing a request carrying neither.
   */
  static required(
    input: SimSecretsManagerSecretValueInput,
  ): SimSecretsManagerSecretValue {
    const value = this.optional(input);

    if (value === undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "Either SecretString or SecretBinary must be supplied",
      );
    }

    return value;
  }

  /**
   * Read a value from request input where supplying one is optional.
   */
  static optional(
    input: SimSecretsManagerSecretValueInput,
  ): SimSecretsManagerSecretValue | undefined {
    const { SecretString: text, SecretBinary: bytes } = input;

    if (text !== undefined && bytes !== undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "SecretString and SecretBinary cannot both be supplied",
      );
    }

    if (text !== undefined) {
      return new SimSecretsManagerSecretValue(text);
    }

    if (bytes !== undefined) {
      return new SimSecretsManagerSecretValue(Uint8Array.from(bytes));
    }

    return undefined;
  }

  /**
   * Read a value back from the bytes it was encrypted as.
   */
  static fromBytes(bytes: Uint8Array): SimSecretsManagerSecretValue {
    const buffer = Buffer.from(bytes);
    const content = buffer.subarray(1);

    if (buffer.at(0) === textMarker) {
      return new SimSecretsManagerSecretValue(content.toString("utf8"));
    }

    return new SimSecretsManagerSecretValue(Uint8Array.from(content));
  }

  /**
   * The text value, if this version holds text.
   */
  get secretString(): string | undefined {
    if (typeof this.content === "string") {
      return this.content;
    }

    return undefined;
  }

  /**
   * The binary value, if this version holds binary.
   *
   * A copy is handed out so a caller mutating the array it receives cannot
   * change the stored secret, as it could not over a real API.
   */
  get secretBinary(): Uint8Array | undefined {
    if (typeof this.content === "string") {
      return undefined;
    }

    return Uint8Array.from(this.content);
  }

  /**
   * The value as the bytes it is encrypted as, marked with its kind.
   */
  get bytes(): Uint8Array {
    if (typeof this.content === "string") {
      return this.markedBytes(textMarker, Buffer.from(this.content, "utf8"));
    }

    return this.markedBytes(binaryMarker, Buffer.from(this.content));
  }

  /**
   * A digest of the value, standing in for the value itself where two of them
   * have to be compared.
   *
   * This is what makes a retried write with the same client request token a
   * no-op rather than a failure, as it is on real AWS. Real Secrets Manager
   * compares the two values; a stored version here holds only ciphertext, and
   * decrypting it would need a `kms:Decrypt` that real AWS does not ask a
   * writer for.
   */
  get digest(): string {
    return createHash("sha256").update(this.bytes).digest("hex");
  }

  private markedBytes(marker: number, content: Buffer): Uint8Array {
    return Uint8Array.from(Buffer.concat([Buffer.of(marker), content]));
  }
}
