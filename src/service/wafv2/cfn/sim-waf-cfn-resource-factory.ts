import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimWafV2 } from "../sim-wafv2.js";
import {
  type SimCfnWafCreators,
  simCfnWafCreators,
  unsupportedSimWafResourceType,
} from "./sim-cfn-waf-creators.js";
import { SimCfnWafResourceDeleter } from "./sim-cfn-waf-resource-deleter.js";
import {
  wafIpSetResourceTypeName,
  wafRegexPatternSetResourceTypeName,
  wafWebAclAssociationResourceTypeName,
  wafWebAclResourceTypeName,
} from "./sim-cfn-waf-resource-types.js";

interface SimWafCfnResourceFactoryProperties {
  readonly wafV2: SimWafV2;
}

/**
 * CloudFormation Resource factory for simulated WAFv2 resources.
 *
 * Four `AWS::WAFv2::*` Resource types are modelled: the web ACL, the
 * association putting one in front of a resource, and the two sets a rule can
 * refer to. A rule group is a resource in its own right that nothing here
 * simulates, and a logging configuration has no log to write to, so a template
 * declaring either is reported as unsupported rather than quietly treated as
 * deployed.
 *
 * A CloudFront distribution is not associated through this factory. CloudFront
 * carries the web ACL on the distribution itself, as `WebACLId`, and simulated
 * CloudFront resolves that ARN when it serves a request.
 */
export class SimWafCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #creators: SimCfnWafCreators;
  readonly #deleter: SimCfnWafResourceDeleter;

  constructor(properties: SimWafCfnResourceFactoryProperties) {
    this.#creators = simCfnWafCreators(properties.wafV2);
    this.#deleter = new SimCfnWafResourceDeleter({
      creators: this.#creators,
    });
  }

  /**
   * Create a simulated WAFv2 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;
    const creators = this.#creators;

    switch (resourceTypeName) {
      case wafWebAclResourceTypeName: {
        return await creators.webAcl.create(resource, properties);
      }
      case wafWebAclAssociationResourceTypeName: {
        return await creators.association.create(
          resource,
          properties,
          context.resources,
        );
      }
      case wafIpSetResourceTypeName: {
        return await creators.ipSet.create(resource, properties);
      }
      case wafRegexPatternSetResourceTypeName: {
        return await creators.regexPatternSet.create(resource, properties);
      }
      default: {
        throw unsupportedSimWafResourceType(resourceTypeName, "");
      }
    }
  }

  /**
   * Delete a simulated WAFv2 resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await this.#deleter.delete(resourceTypeName, resource);
  }
}
