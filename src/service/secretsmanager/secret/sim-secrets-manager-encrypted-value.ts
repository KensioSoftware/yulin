import type { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";

interface SimSecretsManagerEncryptedValueProperties {
  readonly dataKeyCiphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly digest: string;
}

/**
 * The stored form of one secret version's value.
 *
 * This is what a version holds: the value's ciphertext, and beside it the
 * encrypted copy of the data key that produced it. Nothing here can be read
 * without a KMS call, which is the point. The encrypted data key names the KMS
 * key it came from, so a version stays readable after the secret is pointed at
 * a different key, as it does on real AWS.
 */
export class SimSecretsManagerEncryptedValue {
  public readonly dataKeyCiphertext: Uint8Array;
  public readonly iv: Uint8Array;
  public readonly authTag: Uint8Array;
  public readonly ciphertext: Uint8Array;

  private readonly digest: string;

  constructor(properties: SimSecretsManagerEncryptedValueProperties) {
    this.dataKeyCiphertext = properties.dataKeyCiphertext;
    this.iv = properties.iv;
    this.authTag = properties.authTag;
    this.ciphertext = properties.ciphertext;
    this.digest = properties.digest;
  }

  /**
   * Whether this is the encrypted form of the given value.
   *
   * A write repeating a client request token is a no-op when it carries the
   * same value and a failure when it does not, so the two have to be compared
   * without the stored one being readable.
   */
  holds(value: SimSecretsManagerSecretValue): boolean {
    return this.digest === value.digest;
  }
}
