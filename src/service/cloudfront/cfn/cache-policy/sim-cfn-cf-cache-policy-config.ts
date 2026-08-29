import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";

/**
 * Reads an AWS::CloudFront::CachePolicy Resource into a simulated policy.
 *
 * `Name` and `Comment` are what the policy carries. The cache key sections and
 * the TTLs are read past: what they configure is a cache this simulation has
 * yet to grow. A Resource missing its `Name` is refused, as CloudFormation
 * refuses one.
 */
export class SimCfnCfCachePolicyConfig {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * Build the simulated policy this Resource describes.
   */
  build(): SimCloudFrontCachePolicy {
    const config = this.properties["CachePolicyConfig"];

    if (!isRecord(config)) {
      return this.refuse("CachePolicyConfig must be an object");
    }

    const name = config["Name"];

    if (typeof name !== "string") {
      return this.refuse("CachePolicyConfig needs a string Name");
    }

    const comment = config["Comment"];

    return new SimCloudFrontCachePolicy({
      name,
      ...(typeof comment === "string" && { comment }),
    });
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::CachePolicy ${this.resource.logicalId}: ${detail}`,
    );
  }
}
