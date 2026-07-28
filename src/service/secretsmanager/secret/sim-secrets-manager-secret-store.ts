import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSecretsManagerInvalidParameterException,
  SimSecretsManagerInvalidRequestException,
  SimSecretsManagerResourceExistsException,
  SimSecretsManagerResourceNotFoundException,
} from "../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import { SimSecretsManagerSecretIdParser } from "./sim-secrets-manager-secret-id.js";

interface SimSecretsManagerSecretStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The secrets of one simulated Secrets Manager scope, and how a SecretId
 * resolves to one of them.
 *
 * Every operation names its target as a SecretId that may be a friendly name,
 * a full ARN or a partial ARN, so resolution belongs here rather than in each
 * command handler.
 */
export class SimSecretsManagerSecretStore {
  private readonly secrets = new Map<string, SimSecretsManagerSecret>();
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly secretIds: SimSecretsManagerSecretIdParser;

  constructor(properties: SimSecretsManagerSecretStoreProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.secretIds = new SimSecretsManagerSecretIdParser({
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * Every secret in this scope, in creation order.
   */
  get all(): readonly SimSecretsManagerSecret[] {
    return this.secrets.values().toArray();
  }

  /**
   * Store a newly created secret.
   */
  add(secret: SimSecretsManagerSecret): void {
    this.secrets.set(secret.arn.value, secret);
  }

  /**
   * Forget a secret, as happens when its recovery window runs out or when it
   * is deleted without one.
   */
  remove(secret: SimSecretsManagerSecret): void {
    this.secrets.delete(secret.arn.value);
  }

  /**
   * Resolve a SecretId to the secret it names, or refuse.
   *
   * A secret scheduled for deletion still resolves, because it still exists:
   * it can be described and restored until its window runs out.
   */
  require(secretId: string | undefined): SimSecretsManagerSecret {
    if (secretId === undefined || secretId === "") {
      throw new SimSecretsManagerInvalidParameterException(
        "SecretId is required",
      );
    }

    const found = this.find(secretId);

    if (found === undefined) {
      const { accountId, regionName } = this.accountRegionScope;

      throw new SimSecretsManagerResourceNotFoundException(
        `Secrets Manager can't find the specified secret '${secretId}' in ` +
          `Account ${accountId} Region ${regionName}`,
      );
    }

    return found;
  }

  /**
   * Resolve a SecretId in any of the forms real Secrets Manager accepts.
   */
  find(secretId: string): SimSecretsManagerSecret | undefined {
    const resource = this.secretIds.resolveResource(secretId);

    if (resource === undefined) {
      return undefined;
    }

    return this.secrets
      .values()
      .find((secret) => secret.arn.matchesResource(resource));
  }

  /**
   * Refuse a name that is already taken, saying which way it is taken.
   *
   * A name held by a secret waiting out its recovery window is the failure
   * people actually hit when a stack is deleted and redeployed, so it is worth
   * telling apart from a name held by a live secret.
   */
  requireNameAvailable(name: string): void {
    const existing = this.secrets
      .values()
      .find((secret) => secret.name === name);

    if (existing === undefined) {
      return;
    }

    if (existing.isScheduledForDeletion) {
      throw new SimSecretsManagerInvalidRequestException(
        `A secret with the name '${name}' is scheduled for deletion. ` +
          `Wait for the recovery window to elapse, or restore it with ` +
          `RestoreSecret and delete it with ForceDeleteWithoutRecovery.`,
      );
    }

    throw new SimSecretsManagerResourceExistsException(
      `The secret '${name}' already exists`,
    );
  }
}
