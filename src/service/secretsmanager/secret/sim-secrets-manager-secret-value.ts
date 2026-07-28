import { SimSecretsManagerInvalidParameterException } from "../error/sim-secrets-manager.error.js";

/**
 * The two ways a Secrets Manager request can carry a secret value.
 */
export interface SimSecretsManagerSecretValueInput {
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
}

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

  private static bytesEqual(mine: Uint8Array, theirs: Uint8Array): boolean {
    if (mine.length !== theirs.length) {
      return false;
    }

    return mine.every((byte, index) => byte === theirs.at(index));
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
   * Whether another value holds exactly the same content.
   *
   * This is what makes a retried write with the same client request token a
   * no-op rather than a failure, as it is on real AWS.
   */
  equals(other: SimSecretsManagerSecretValue): boolean {
    if (typeof this.content === "string" || typeof other.content === "string") {
      return this.content === other.content;
    }

    return SimSecretsManagerSecretValue.bytesEqual(this.content, other.content);
  }
}
