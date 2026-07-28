import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

const arnPrefix = "arn:";
const arnPartCount = 7;
const secretsManagerService = "secretsmanager";
const secretResourceType = "secret";

interface SimSecretsManagerSecretIdParserProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Turns the SecretId every Secrets Manager operation takes into the resource
 * part it names.
 *
 * Real Secrets Manager accepts three forms — a friendly name, a full ARN with
 * its six-character suffix, and a partial ARN without it — so working out
 * which one is in hand belongs in one place rather than in each command.
 *
 * An ARN naming another Account or Region resolves to nothing rather than
 * having its name read out and looked up locally, so a foreign ARN cannot
 * reach a secret that happens to share a name.
 */
export class SimSecretsManagerSecretIdParser {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSecretsManagerSecretIdParserProperties) {
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * The resource part a SecretId names in this scope, if it names one here.
   */
  resolveResource(secretId: string): string | undefined {
    if (!secretId.startsWith(arnPrefix)) {
      return secretId;
    }

    return this.arnResource(secretId);
  }

  private arnResource(arn: string): string | undefined {
    const parts = arn.split(":");

    if (parts.length !== arnPartCount) {
      return undefined;
    }

    const [service, regionName, accountId, resourceType, resource] =
      parts.slice(2);

    if (
      service !== secretsManagerService ||
      resourceType !== secretResourceType
    ) {
      return undefined;
    }

    if (
      regionName !== this.accountRegionScope.regionName ||
      accountId !== this.accountRegionScope.accountId
    ) {
      return undefined;
    }

    return resource;
  }
}
