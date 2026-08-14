import {
  constants,
  type KeyObject,
  type SignKeyObjectInput,
} from "node:crypto";

interface SimKmsSigningAlgorithmProperties {
  readonly name: string;
  readonly digest: string;
  readonly probabilisticPadding?: boolean | undefined;
}

/**
 * One KMS signing algorithm, translated into what Node's crypto needs.
 *
 * The AWS name carries two things: the digest to hash the message with, and,
 * for RSA, which of the two padding schemes to use. Both signatures are real,
 * so the padding has to be the padding AWS uses rather than whichever one Node
 * defaults to.
 */
export class SimKmsSigningAlgorithm {
  public readonly name: string;
  public readonly digest: string;

  private readonly probabilisticPadding: boolean;

  constructor(properties: SimKmsSigningAlgorithmProperties) {
    this.name = properties.name;
    this.digest = properties.digest;
    this.probabilisticPadding = properties.probabilisticPadding ?? false;
  }

  /**
   * The key input for a sign or verify call under this algorithm.
   *
   * RSASSA-PSS needs the padding named and a salt the length of the digest,
   * which is what KMS signs with. Everything else takes the key on its own:
   * PKCS#1 v1.5 is Node's default RSA padding, and an EC key has no padding to
   * choose.
   */
  keyInput(key: KeyObject): KeyObject | SignKeyObjectInput {
    if (!this.probabilisticPadding) {
      return key;
    }

    return {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    };
  }
}
