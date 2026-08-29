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
import { SimCfnCfResponseHeadersPolicyCreator } from "./response-headers-policy/sim-cfn-cf-rh-policy-creator.js";
import { SimCfnCfCachePolicyCreator } from "./cache-policy/sim-cfn-cf-cache-policy-creator.js";
import { SimCfnCfOriginRequestPolicyCreator } from "./origin-request-policy/sim-cfn-cf-orp-creator.js";
import { SimCfnCfOriginAccessControlCreator } from "./origin-access-control/sim-cfn-cf-oac-creator.js";
import { SimCfnCfKeyValueStoreCreator } from "./key-value-store/sim-cfn-cf-kvs-creator.js";

/**
 * CloudFormation Resource factory for simulated CloudFront resources.
 */
export class SimCloudFrontCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly distroCreator: SimCfnCfDistroCreator;
  private readonly functionCreator: SimCfnCffCreator;
  private readonly distroDeleter: SimCfnCfDistroDeleter;
  private readonly responseHeadersPolicyCreator: SimCfnCfResponseHeadersPolicyCreator;
  private readonly cachePolicyCreator: SimCfnCfCachePolicyCreator;
  private readonly originRequestPolicyCreator: SimCfnCfOriginRequestPolicyCreator;
  private readonly originAccessControlCreator: SimCfnCfOriginAccessControlCreator;
  private readonly keyValueStoreCreator: SimCfnCfKeyValueStoreCreator;

  constructor(cloudFront: SimCloudFront) {
    this.distroCreator = new SimCfnCfDistroCreator({ cloudFront });
    this.functionCreator = new SimCfnCffCreator({ cloudFront });
    this.distroDeleter = new SimCfnCfDistroDeleter({ cloudFront });
    this.responseHeadersPolicyCreator =
      new SimCfnCfResponseHeadersPolicyCreator({ cloudFront });
    this.cachePolicyCreator = new SimCfnCfCachePolicyCreator({ cloudFront });
    this.originRequestPolicyCreator = new SimCfnCfOriginRequestPolicyCreator({
      cloudFront,
    });
    this.originAccessControlCreator = new SimCfnCfOriginAccessControlCreator({
      cloudFront,
    });
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

    switch (resourceTypeName) {
      case "Distribution": {
        return await this.distroCreator.create(resource, properties, context);
      }
      case "Function": {
        return await this.functionCreator.create(resource, properties, context);
      }
      case "ResponseHeadersPolicy": {
        return this.responseHeadersPolicyCreator.create(resource, properties);
      }
      case "CachePolicy": {
        return this.cachePolicyCreator.create(resource, properties);
      }
      case "OriginRequestPolicy": {
        return this.originRequestPolicyCreator.create(resource, properties);
      }
      case "OriginAccessControl": {
        return this.originAccessControlCreator.create(resource, properties);
      }
      case "KeyValueStore": {
        return await this.keyValueStoreCreator.create(
          resource,
          properties,
          simCfnResourceCallerOptions(context.caller),
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

    switch (resourceTypeName) {
      case "Distribution": {
        await this.distroDeleter.delete(resource, options);
        return;
      }
      case "Function": {
        await this.functionCreator.delete(resource, options);
        return;
      }
      case "ResponseHeadersPolicy": {
        this.responseHeadersPolicyCreator.delete(resource);
        return;
      }
      case "CachePolicy": {
        this.cachePolicyCreator.delete(resource);
        return;
      }
      case "OriginRequestPolicy": {
        this.originRequestPolicyCreator.delete(resource);
        return;
      }
      case "OriginAccessControl": {
        this.originAccessControlCreator.delete(resource);
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
