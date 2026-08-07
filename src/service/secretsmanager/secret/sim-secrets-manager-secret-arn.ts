import { randomBytes } from "node:crypto";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The alphabet and length of the suffix real Secrets Manager appends to a
 * secret ARN.
 */
const suffixAlphabet =
  // oxlint-disable-next-line no-secrets/no-secrets -- an alphabet, not a secret.
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const secretArnSuffixLength = 6;

/**
 * A name already carrying something shaped like an ARN suffix.
 *
 * This is the pattern that makes a partial ARN ambiguous, so both ARN building
 * and secret name validation need it.
 */
export const secretArnSuffixPattern = /-[\dA-Za-z]{6}$/;

/**
 * Six random characters, as real Secrets Manager appends to every secret ARN.
 */
function randomSuffix(): string {
  const bytes = randomBytes(secretArnSuffixLength);
  let suffix = "";

  for (const byte of bytes) {
    suffix += suffixAlphabet.charAt(byte % suffixAlphabet.length);
  }

  return suffix;
}

interface SimSecretsManagerSecretArnProperties {
  readonly name: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly suffix?: string | undefined;
}

/**
 * The ARN of one simulated secret, and the parts a caller can name it by.
 *
 * Real Secrets Manager appends a hyphen and six random characters to the
 * secret name in its ARN, which is why an IAM policy written against a secret
 * has to end in `-??????` or a wildcard rather than the bare name. Reproducing
 * that is the whole point of this class: a policy that works here is one that
 * would work on real AWS.
 */
export class SimSecretsManagerSecretArn {
  public readonly name: string;
  public readonly suffix: string;

  /**
   * The name with its ARN suffix, which is the resource part of the ARN.
   */
  public readonly suffixedName: string;

  public readonly value: string;

  constructor(properties: SimSecretsManagerSecretArnProperties) {
    const { name, accountRegionScope, suffix = randomSuffix() } = properties;

    this.name = name;
    this.suffix = suffix;
    this.suffixedName = `${name}-${suffix}`;
    this.value =
      `arn:aws:secretsmanager:${accountRegionScope.regionName}:` +
      `${accountRegionScope.accountId}:secret:${this.suffixedName}`;
  }

  /**
   * Whether a resource part from a full or partial ARN names this secret.
   *
   * A full ARN carries the suffix and a partial ARN does not, and both are
   * valid ways to name a secret on real AWS.
   */
  matchesResource(resource: string): boolean {
    return resource === this.suffixedName || resource === this.name;
  }
}
