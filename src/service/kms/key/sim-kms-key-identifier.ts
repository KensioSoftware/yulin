import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simKmsAliasPrefix } from "./sim-kms-alias.js";

/**
 * What a KeyId names: an alias, a key, or nothing this scope can resolve.
 */
export class SimKmsKeyIdentifier {
  public readonly aliasName: string | undefined;
  public readonly keyId: string | undefined;

  private constructor(
    aliasName: string | undefined,
    keyId: string | undefined,
  ) {
    this.aliasName = aliasName;
    this.keyId = keyId;
  }

  /**
   * An identifier naming nothing resolvable here.
   */
  static none(): SimKmsKeyIdentifier {
    return new SimKmsKeyIdentifier(undefined, undefined);
  }

  /**
   * An identifier naming an alias.
   */
  static alias(aliasName: string): SimKmsKeyIdentifier {
    return new SimKmsKeyIdentifier(aliasName, undefined);
  }

  /**
   * An identifier naming a key.
   */
  static key(keyId: string): SimKmsKeyIdentifier {
    return new SimKmsKeyIdentifier(undefined, keyId);
  }
}

/**
 * Reads the four forms of KeyId real KMS accepts, within one scope.
 *
 * A key ARN and an alias ARN both name an Account and a Region, and KMS keys
 * are scoped to both. An ARN belonging to somewhere else therefore resolves to
 * nothing here rather than having its identifier pulled out and looked up
 * locally, which would let a foreign ARN reach a key that happens to share an
 * identifier.
 */
export class SimKmsKeyIdentifierParser {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * Read what a KeyId names.
   */
  parse(keyId: string): SimKmsKeyIdentifier {
    if (keyId.startsWith("arn:")) {
      return this.parseArn(keyId);
    }

    if (keyId.startsWith(simKmsAliasPrefix)) {
      return SimKmsKeyIdentifier.alias(keyId);
    }

    return SimKmsKeyIdentifier.key(keyId);
  }

  /**
   * Read a key or alias ARN, refusing one belonging to another scope.
   */
  private parseArn(arn: string): SimKmsKeyIdentifier {
    const [, partition, service, regionName, accountId, ...rest] =
      arn.split(":");

    if (
      partition !== "aws" ||
      service !== "kms" ||
      regionName !== this.accountRegionScope.regionName ||
      accountId !== this.accountRegionScope.accountId
    ) {
      return SimKmsKeyIdentifier.none();
    }

    return this.parseArnResource(rest.join(":"));
  }

  private parseArnResource(resource: string): SimKmsKeyIdentifier {
    if (resource.startsWith(simKmsAliasPrefix)) {
      return SimKmsKeyIdentifier.alias(resource);
    }

    const keyId = /^key\/(.+)$/u.exec(resource)?.[1];

    if (keyId === undefined) {
      return SimKmsKeyIdentifier.none();
    }

    return SimKmsKeyIdentifier.key(keyId);
  }
}
