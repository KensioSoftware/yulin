import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimKms } from "../sim-kms.js";
import { SimCfnKmsAliasCreator } from "./alias/sim-cfn-kms-alias-creator.js";
import { SimCfnKmsKeyCreator } from "./key/sim-cfn-kms-key-creator.js";
import { SimCfnKmsResourceDeleter } from "./sim-cfn-kms-resource-deleter.js";

interface SimKmsCfnResourceFactoryProperties {
  readonly kms: SimKms;
}

/**
 * CloudFormation Resource factory for simulated KMS resources.
 */
export class SimKmsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly keyCreator: SimCfnKmsKeyCreator;
  private readonly aliasCreator: SimCfnKmsAliasCreator;
  private readonly deleter: SimCfnKmsResourceDeleter;

  constructor(properties: SimKmsCfnResourceFactoryProperties) {
    this.keyCreator = new SimCfnKmsKeyCreator({ kms: properties.kms });
    this.aliasCreator = new SimCfnKmsAliasCreator({ kms: properties.kms });
    this.deleter = new SimCfnKmsResourceDeleter({ kms: properties.kms });
  }

  /**
   * Create a simulated KMS resource from a CloudFormation Resource.
   *
   * Grants and replica keys are not simulated, so their Resource types are
   * reported as unsupported rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "Key": {
        return await this.keyCreator.create(resource, properties);
      }
      case "Alias": {
        return await this.aliasCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim KMS CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated KMS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource);
  }
}
