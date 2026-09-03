import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { SimCfnCfDistroCreator } from "./distro/sim-cfn-cf-distro-creator.js";
import { SimCfnCffCreator } from "./cff/sim-cfn-cff-creator.js";
import { SimCfnCfDistroDeleter } from "./distro/sim-cfn-cf-distro-deleter.js";
import { SimCfnCfPolicyCreators } from "./policy/sim-cfn-cf-policy-creators.js";
import { SimCfnCfKeyValueStoreCreator } from "./key-value-store/sim-cfn-cf-kvs-creator.js";

/**
 * CloudFormation Resource factory for simulated CloudFront resources.
 */
export class SimCloudFrontCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly distroCreator: SimCfnCfDistroCreator;
  private readonly functionCreator: SimCfnCffCreator;
  private readonly distroDeleter: SimCfnCfDistroDeleter;
  private readonly policyCreators: SimCfnCfPolicyCreators;
  private readonly keyValueStoreCreator: SimCfnCfKeyValueStoreCreator;

  constructor(cloudFront: SimCloudFront) {
    this.distroCreator = new SimCfnCfDistroCreator({ cloudFront });
    this.functionCreator = new SimCfnCffCreator({ cloudFront });
    this.distroDeleter = new SimCfnCfDistroDeleter({ cloudFront });
    this.policyCreators = new SimCfnCfPolicyCreators(cloudFront);
    this.keyValueStoreCreator = new SimCfnCfKeyValueStoreCreator({
      cloudFront,
    });
  }

  /**
   * Create a simulated CloudFront resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;
    const options = simCfnResourceCallerOptions(context.caller);
    const policyCreator = this.policyCreators.creatorFor(resourceTypeName);

    if (policyCreator !== undefined) {
      return policyCreator.create(resource, properties, options);
    }

    switch (resourceTypeName) {
      case "Distribution": {
        return await this.distroCreator.create(resource, properties, context);
      }
      case "Function": {
        return await this.functionCreator.create(resource, properties, context);
      }
      case "KeyValueStore": {
        return await this.keyValueStoreCreator.create(
          resource,
          properties,
          options,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim CloudFront CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated CloudFront resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    const options = simCfnResourceCallerOptions(context.caller);
    const policyCreator = this.policyCreators.creatorFor(resourceTypeName);

    if (policyCreator !== undefined) {
      policyCreator.delete(resource, options);
      return;
    }

    switch (resourceTypeName) {
      case "Distribution": {
        await this.distroDeleter.delete(resource, options);
        return;
      }
      case "Function": {
        await this.functionCreator.delete(resource, options);
        return;
      }
      case "KeyValueStore": {
        await this.keyValueStoreCreator.delete(resource, options);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim CloudFront CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }
}
