import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimSecretsManager } from "../sim-secrets-manager.js";
import { SimCfnSecretsManagerSecretCreator } from "./secret/sim-cfn-secrets-manager-secret-creator.js";
import type { SimSecretsManagerSecret } from "../secret/sim-secrets-manager-secret.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimSecretsManagerCfnResourceFactoryProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * CloudFormation Resource factory for simulated Secrets Manager resources.
 */
export class SimSecretsManagerCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly secretsManager: SimSecretsManager;
  private readonly secretCreator: SimCfnSecretsManagerSecretCreator;

  constructor(properties: SimSecretsManagerCfnResourceFactoryProperties) {
    this.secretsManager = properties.secretsManager;
    this.secretCreator = new SimCfnSecretsManagerSecretCreator({
      secretsManager: properties.secretsManager,
    });
  }

  /**
   * Create a simulated Secrets Manager resource from a CloudFormation
   * Resource.
   *
   * Rotation, resource policies and target attachments are not simulated, so
   * their Resource types are reported as unsupported and skipped rather than
   * quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Secret": {
        return await this.secretCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
          simCfnResourceCallerOptions(context.caller),
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Secrets Manager CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated Secrets Manager resource created from a CloudFormation
   * Resource.
   *
   * DeleteSecret schedules the deletion rather than carrying it out, so a torn
   * down Stack leaves a secret waiting out its recovery window. That is what
   * CloudFormation does: the secret is recoverable afterwards, which is the
   * point of the window.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    if (resourceTypeName !== "Secret") {
      throw new Error(
        `Unsupported sim Secrets Manager CloudFormation Resource ${resourceTypeName} deletion`,
      );
    }

    const secret = resource.simResource as SimSecretsManagerSecret | undefined;
    assertDefined(
      secret,
      `sim Secrets Manager secret for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.secretsManager.deleteSecret(
      { input: { SecretId: secret.arn.value } },
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
