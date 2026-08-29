import { randomUUID } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";
import { SimCloudFrontCacheKey } from "./sim-cf-cache-key.js";

export type SimCloudFrontCachePolicyId = Brand<
  string,
  "SimCloudFrontCachePolicyId"
>;

const daySeconds = 86_400;
const yearSeconds = 31_536_000;

interface SimCloudFrontCachePolicyProperties {
  readonly id?: SimCloudFrontCachePolicyId;
  readonly name: string;
  readonly comment?: string | undefined;
  readonly minTtlSec?: number;
  readonly defaultTtlSec?: number;
  readonly maxTtlSec?: number;
  readonly cacheKey?: SimCloudFrontCacheKey;
}

/**
 * Simulated CloudFront cache policy.
 *
 * A cache policy decides what a cache Behavior keys its cache on and how long
 * an object stays there. This simulation holds the policy under its ID, along
 * with its three TTLs and its cache key, and keys the Distribution's cache on
 * it. Nothing expires yet, so a `MaxTTL` of zero is read as a Behavior that
 * caches nothing and the other two TTLs decide nothing.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html
 */
export class SimCloudFrontCachePolicy {
  public readonly id: SimCloudFrontCachePolicyId;
  public readonly name: string;
  public readonly comment: string | undefined;
  public readonly minTtlSec: number;
  public readonly defaultTtlSec: number;
  public readonly maxTtlSec: number;
  public readonly cacheKey: SimCloudFrontCacheKey;

  constructor(properties: SimCloudFrontCachePolicyProperties) {
    this.id = properties.id ?? (randomUUID() as SimCloudFrontCachePolicyId);
    this.name = properties.name;
    this.comment = properties.comment;
    this.minTtlSec = properties.minTtlSec ?? 0;
    this.defaultTtlSec =
      properties.defaultTtlSec ?? Math.max(daySeconds, this.minTtlSec);
    this.maxTtlSec =
      properties.maxTtlSec ?? maxTtlDefault(this.minTtlSec, this.defaultTtlSec);
    this.cacheKey = properties.cacheKey ?? new SimCloudFrontCacheKey();
  }
}

/**
 * The `MaxTTL` CloudFront settles on where a policy left it out.
 *
 * It is a year, except where a longer `MinTTL` or `DefaultTTL` would sit above
 * it, in which case CloudFront takes the `DefaultTTL` rather than capping the
 * policy below its own floor.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-cachepolicy-cachepolicyconfig.html
 */
function maxTtlDefault(minTtlSec: number, defaultTtlSec: number): number {
  return minTtlSec > yearSeconds || defaultTtlSec > yearSeconds
    ? defaultTtlSec
    : yearSeconds;
}

export type SimCloudFrontCachePolicyMap = Map<
  SimCloudFrontCachePolicyId,
  SimCloudFrontCachePolicy
>;
