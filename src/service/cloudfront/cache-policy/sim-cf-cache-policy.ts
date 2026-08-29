import { randomUUID } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";

export type SimCloudFrontCachePolicyId = Brand<
  string,
  "SimCloudFrontCachePolicyId"
>;

interface SimCloudFrontCachePolicyProperties {
  readonly id?: SimCloudFrontCachePolicyId;
  readonly name: string;
  readonly comment?: string | undefined;
}

/**
 * Simulated CloudFront cache policy.
 *
 * A cache policy decides what a cache Behavior keys its cache on and how long
 * an object stays there. This simulation holds the policy under its ID and
 * hands it back. The cache key, the TTLs and the compression settings belong
 * to a simulated cache, which CloudFront here has yet to grow.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html
 */
export class SimCloudFrontCachePolicy {
  public readonly id: SimCloudFrontCachePolicyId;
  public readonly name: string;
  public readonly comment: string | undefined;

  constructor(properties: SimCloudFrontCachePolicyProperties) {
    this.id = properties.id ?? (randomUUID() as SimCloudFrontCachePolicyId);
    this.name = properties.name;
    this.comment = properties.comment;
  }
}

export type SimCloudFrontCachePolicyMap = Map<
  SimCloudFrontCachePolicyId,
  SimCloudFrontCachePolicy
>;
