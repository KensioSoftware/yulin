import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import { simCfnCfCachePolicyCacheKey } from "./sim-cfn-cf-cache-policy-key.js";
import type { SimCfnCfCachePolicyRefuse } from "./sim-cfn-cf-cache-policy-section.js";

/**
 * Reads an AWS::CloudFront::CachePolicy Resource into a simulated policy.
 *
 * The policy carries its `Name`, its `Comment`, its three TTLs and the cache
 * key of its `ParametersInCacheKeyAndForwardedToOrigin`. A TTL a template left
 * out falls back to CloudFront's own default rather than to nothing, so a
 * policy holds what one in an account holds either way. A Resource missing its
 * `Name` is refused, as CloudFormation refuses one.
 */
export class SimCfnCfCachePolicyConfig {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private readonly refuse: SimCfnCfCachePolicyRefuse = (detail) => {
    throw new Error(
      `Invalid AWS::CloudFront::CachePolicy ${this.resource.logicalId}: ${detail}`,
    );
  };

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
    const { refuse } = this;
    const config = this.properties["CachePolicyConfig"];

    if (!isRecord(config)) {
      return refuse("CachePolicyConfig must be an object");
    }

    const name = config["Name"];

    if (typeof name !== "string") {
      return refuse("CachePolicyConfig needs a string Name");
    }

    const comment = config["Comment"];
    const minTtlSec = ttlSeconds(config, "MinTTL", refuse);
    const defaultTtlSec = ttlSeconds(config, "DefaultTTL", refuse);
    const maxTtlSec = ttlSeconds(config, "MaxTTL", refuse);

    return new SimCloudFrontCachePolicy({
      name,
      ...(typeof comment === "string" && { comment }),
      ...(minTtlSec !== undefined && { minTtlSec }),
      ...(defaultTtlSec !== undefined && { defaultTtlSec }),
      ...(maxTtlSec !== undefined && { maxTtlSec }),
      cacheKey: simCfnCfCachePolicyCacheKey(config, refuse),
    });
  }
}

/**
 * One TTL, or nothing where the template left it out for CloudFront's default
 * to stand in.
 *
 * A template here is often a JavaScript object rather than parsed JSON, so a
 * fraction, a negative or a NaN can reach this where a deployed template could
 * not carry one, and none of them is a length of time an object could sit in a
 * cache for.
 */
function ttlSeconds(
  config: Record<string, unknown>,
  field: string,
  refuse: SimCfnCfCachePolicyRefuse,
): number | undefined {
  // oxlint-disable-next-line security/detect-object-injection
  const value = config[field];

  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : refuse(`CachePolicyConfig ${field} must be a whole number of seconds`);
}
