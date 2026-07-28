import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSecretsManager } from "../sim-secrets-manager.js";
import { SimCfnSecretsManagerSecretCreator } from "./secret/sim-cfn-secrets-manager-secret-creator.js";

interface SimSecretsManagerCfnResourceFactoryProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * CloudFormation Resource factory for simulated Secrets Manager resources.
 */
export class SimSecretsManagerCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly secretCreator: SimCfnSecretsManagerSecretCreator;

  constructor(properties: SimSecretsManagerCfnResourceFactoryProperties) {
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
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Secrets Manager CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
