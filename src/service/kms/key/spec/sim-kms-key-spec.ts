import { SimKmsInvalidKeyUsageException } from "../../error/sim-kms.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimKmsSigningAlgorithm } from "./sim-kms-signing-algorithm.js";

/**
 * What a key can be used for. A key has exactly one usage, fixed when it is
 * created, and it is what decides which operations the key answers.
 */
export const SimKmsKeyUsage = {
  EncryptDecrypt: "ENCRYPT_DECRYPT",
  SignVerify: "SIGN_VERIFY",
} as const;

export type SimKmsKeyUsage =
  (typeof SimKmsKeyUsage)[keyof typeof SimKmsKeyUsage];

/**
 * The Node key pair parameters behind an asymmetric key spec.
 *
 * A key spec is an AWS name for a curve or a modulus length, so this is the
 * translation of that name into what `generateKeyPairSync` needs.
 */
export interface SimKmsEcKeyPair {
  readonly type: "ec";
  readonly namedCurve: string;
}

export interface SimKmsRsaKeyPair {
  readonly type: "rsa";
  readonly modulusLength: number;
}

export type SimKmsKeyPairParameters = SimKmsEcKeyPair | SimKmsRsaKeyPair;

interface SimKmsKeySpecProperties {
  readonly name: string;
  readonly keyUsage: SimKmsKeyUsage;
  readonly keyPair?: SimKmsKeyPairParameters | undefined;
  readonly signingAlgorithms?: readonly SimKmsSigningAlgorithm[] | undefined;
  readonly encryptionAlgorithms?: readonly string[] | undefined;
}

/**
 * One key spec this simulation models, and what a key of that spec can do.
 *
 * The spec is the single answer to three questions that used to be constants:
 * what material the key holds, which operations it answers, and which
 * algorithms those operations accept.
 */
export class SimKmsKeySpec {
  public readonly name: string;
  public readonly keyUsage: SimKmsKeyUsage;
  public readonly signingAlgorithms: readonly SimKmsSigningAlgorithm[];
  public readonly encryptionAlgorithms: readonly string[];

  private readonly keyPair: SimKmsKeyPairParameters | undefined;

  constructor(properties: SimKmsKeySpecProperties) {
    this.name = properties.name;
    this.keyUsage = properties.keyUsage;
    this.keyPair = properties.keyPair;
    this.signingAlgorithms = properties.signingAlgorithms ?? [];
    this.encryptionAlgorithms = properties.encryptionAlgorithms ?? [];
  }

  /**
   * Whether this spec holds a key pair rather than symmetric key material.
   */
  get isAsymmetric(): boolean {
    return this.keyPair !== undefined;
  }

  /**
   * The Node key pair parameters for this spec.
   */
  keyPairParameters(): SimKmsKeyPairParameters {
    const keyPair = this.keyPair;
    assertDefined(keyPair, `key pair parameters for key spec ${this.name}`);

    return keyPair;
  }

  /**
   * The signing algorithm names, as DescribeKey and GetPublicKey report them.
   */
  signingAlgorithmNames(): readonly string[] {
    return this.signingAlgorithms.map((algorithm) => algorithm.name);
  }

  /**
   * Resolve the signing algorithm a Sign or Verify request asks for.
   *
   * AWS requires the algorithm on every signing request rather than defaulting
   * it, because the choice is part of what the signature means, so an omitted
   * one is refused here too.
   */
  requireSigningAlgorithm(
    algorithmName: string | undefined,
  ): SimKmsSigningAlgorithm {
    if (this.signingAlgorithms.length === 0) {
      throw new SimKmsInvalidKeyUsageException(
        `A ${this.name} key cannot sign or verify: its KeyUsage is ${this.keyUsage}`,
      );
    }

    if (algorithmName === undefined) {
      throw new SimKmsInvalidKeyUsageException(
        `SigningAlgorithm is required, and must be one of ${this.signingAlgorithmNames().join(", ")}`,
      );
    }

    const algorithm = this.signingAlgorithms.find(
      (candidate) => candidate.name === algorithmName,
    );

    if (algorithm === undefined) {
      throw new SimKmsInvalidKeyUsageException(
        `SigningAlgorithm '${algorithmName}' is not valid for a ${this.name} key: use one of ${this.signingAlgorithmNames().join(", ")}`,
      );
    }

    return algorithm;
  }
}
