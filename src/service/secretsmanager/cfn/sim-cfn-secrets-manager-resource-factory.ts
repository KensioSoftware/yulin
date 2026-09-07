import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceInPlaceUpdateContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimSecretsManager } from "../sim-secrets-manager.js";
import { SimCfnSecretsManagerSecretCreator } from "./secret/sim-cfn-secrets-manager-secret-creator.js";
import { SimCfnSecretsManagerSecretDeleter } from "./secret/sim-cfn-secrets-manager-secret-deleter.js";
import { SimCfnSecretsManagerSecretUpdater } from "./secret/sim-cfn-secrets-manager-secret-updater.js";
import { simCfnSecretsManagerSecretReplaced } from "./secret/sim-cfn-secrets-manager-secret-change.js";
import {
  isSimCfnSecretsManagerSecret,
  requireSimCfnSecretsManagerSecret,
} from "./sim-cfn-secrets-manager-resource-type.js";

interface SimSecretsManagerCfnResourceFactoryProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * CloudFormation Resource factory for simulated Secrets Manager resources.
 *
 * Only `Secret` is deployed. Rotation, resource policies and target
 * attachments are not simulated, so their Resource types are reported as
 * unsupported and skipped rather than quietly treated as deployed.
 */
export class SimSecretsManagerCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly secretCreator: SimCfnSecretsManagerSecretCreator;
  private readonly secretUpdater: SimCfnSecretsManagerSecretUpdater;
  private readonly secretDeleter: SimCfnSecretsManagerSecretDeleter;

  constructor(properties: SimSecretsManagerCfnResourceFactoryProperties) {
    const { secretsManager } = properties;

    this.secretCreator = new SimCfnSecretsManagerSecretCreator({
      secretsManager,
    });
    this.secretUpdater = new SimCfnSecretsManagerSecretUpdater({
      secretsManager,
    });
    this.secretDeleter = new SimCfnSecretsManagerSecretDeleter({
      secretsManager,
    });
  }

  /**
   * Create a simulated Secrets Manager resource from a CloudFormation
   * Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    requireSimCfnSecretsManagerSecret(resourceTypeName);

    return await this.secretCreator.create(
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }

  /**
   * Whether a changed secret can be applied to the deployed one.
   *
   * Name is the only property real CloudFormation replaces a secret for.
   * Everything else is applied with no interruption, which is what keeps a
   * generated value across a change to the secret's description or tags.
   */
  updatesInPlace(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
  ): boolean {
    return (
      isSimCfnSecretsManagerSecret(resourceTypeName) &&
      !simCfnSecretsManagerSecretReplaced(current, updated)
    );
  }

  /**
   * Apply a changed AWS::SecretsManager::Secret Resource to the deployed
   * secret.
   */
  async updateInPlace(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceInPlaceUpdateContext,
  ): Promise<object | undefined> {
    requireSimCfnSecretsManagerSecret(resourceTypeName, "update");

    return await this.secretUpdater.update(current, updated, context);
  }

  /**
   * Delete a simulated Secrets Manager resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    requireSimCfnSecretsManagerSecret(resourceTypeName, "deletion");

    await this.secretDeleter.delete(
      resource,
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
