import { randomUUID } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";
import { SimCfOriginRequestForwarding } from "./sim-cf-origin-request-forwarding.js";

export type SimCloudFrontOriginRequestPolicyId = Brand<
  string,
  "SimCloudFrontOriginRequestPolicyId"
>;

interface SimCloudFrontOriginRequestPolicyProperties {
  readonly id?: SimCloudFrontOriginRequestPolicyId;
  readonly name: string;
  readonly comment?: string | undefined;
  readonly forwarding?: SimCfOriginRequestForwarding;
}

/**
 * Simulated CloudFront origin request policy.
 *
 * An origin request policy decides which of the viewer's headers, cookies and
 * query strings a cache Behavior carries to its Origin. This simulation holds
 * the policy under its ID, along with the three sections that say what it
 * forwards, and narrows a custom Origin request to them.
 *
 * What reaches the Origin is the union of these sections and the Behavior's
 * cache key, since CloudFront forwards everything it keyed the cache on as
 * well.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
 */
export class SimCloudFrontOriginRequestPolicy {
  public readonly id: SimCloudFrontOriginRequestPolicyId;
  public readonly name: string;
  public readonly comment: string | undefined;
  public readonly forwarding: SimCfOriginRequestForwarding;

  constructor(properties: SimCloudFrontOriginRequestPolicyProperties) {
    this.id =
      properties.id ?? (randomUUID() as SimCloudFrontOriginRequestPolicyId);
    this.name = properties.name;
    this.comment = properties.comment;
    this.forwarding =
      properties.forwarding ?? new SimCfOriginRequestForwarding();
  }
}

export type SimCloudFrontOriginRequestPolicyMap = Map<
  SimCloudFrontOriginRequestPolicyId,
  SimCloudFrontOriginRequestPolicy
>;
