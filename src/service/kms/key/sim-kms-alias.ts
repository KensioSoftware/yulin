import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimKmsValidationException } from "../error/sim-kms.error.js";
import type { SimKmsKeyId } from "./sim-kms-key.js";

/**
 * The prefix every KMS alias name carries.
 */
export const simKmsAliasPrefix = "alias/";

/**
 * The prefix reserved for aliases of AWS managed keys, such as
 * `alias/aws/s3`. Real KMS refuses to let a customer create one.
 */
export const simKmsAwsAliasPrefix = "alias/aws/";

interface SimKmsAliasProperties {
  readonly aliasName: string;
  readonly targetKeyId: SimKmsKeyId;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * An alias pointing at one simulated KMS key.
 *
 * An alias is a mutable name for a key rather than part of the key, so it is
 * stored separately: retargeting an alias must not disturb the key, and
 * deleting an alias must leave the key alone.
 */
export class SimKmsAlias {
  public readonly aliasName: string;
  public readonly arn: string;
  public readonly targetKeyId: SimKmsKeyId;

  constructor(properties: SimKmsAliasProperties) {
    const { accountRegionScope } = properties;

    this.aliasName = properties.aliasName;
    this.arn = `arn:aws:kms:${accountRegionScope.regionName}:${accountRegionScope.accountId}:${properties.aliasName}`;
    this.targetKeyId = properties.targetKeyId;
  }
}

/**
 * Checks alias names against the rules real KMS applies.
 *
 * Failing an invalid name here rather than storing it keeps a test from
 * passing on an alias that CreateAlias would reject on real AWS.
 */
export class SimKmsAliasName {
  private static readonly allowed = /^[\w/-]+$/u;

  /**
   * Validate an alias name a customer asked to create.
   */
  validateCustomerAlias(aliasName: string): void {
    if (!aliasName.startsWith(simKmsAliasPrefix)) {
      throw new SimKmsValidationException(
        `Alias must start with '${simKmsAliasPrefix}': ${aliasName}`,
      );
    }

    if (aliasName.startsWith(simKmsAwsAliasPrefix)) {
      throw new SimKmsValidationException(
        `Alias '${aliasName}' is reserved for AWS managed keys`,
      );
    }

    if (!SimKmsAliasName.allowed.test(aliasName)) {
      throw new SimKmsValidationException(
        `Alias '${aliasName}' contains characters KMS does not allow`,
      );
    }
  }
}
