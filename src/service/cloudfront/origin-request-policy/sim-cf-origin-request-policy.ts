import { randomUUID } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";

export type SimCloudFrontOriginRequestPolicyId = Brand<
  string,
  "SimCloudFrontOriginRequestPolicyId"
>;

interface SimCloudFrontOriginRequestPolicyProperties {
  readonly id?: SimCloudFrontOriginRequestPolicyId;
  readonly name: string;
  readonly comment?: string | undefined;
}

/**
 * Simulated CloudFront origin request policy.
 *
 * An origin request policy decides which of the viewer's headers, cookies and
 * query strings a cache Behavior carries to its Origin. This simulation holds
 * the policy under its ID and hands it back. Sim CloudFront forwards the
 * viewer's request whole, so the header, cookie and query string sections
 * belong to a narrowing it has yet to grow.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
 */
export class SimCloudFrontOriginRequestPolicy {
  public readonly id: SimCloudFrontOriginRequestPolicyId;
  public readonly name: string;
  public readonly comment: string | undefined;

  constructor(properties: SimCloudFrontOriginRequestPolicyProperties) {
    this.id =
      properties.id ?? (randomUUID() as SimCloudFrontOriginRequestPolicyId);
    this.name = properties.name;
    this.comment = properties.comment;
  }
}

export type SimCloudFrontOriginRequestPolicyMap = Map<
  SimCloudFrontOriginRequestPolicyId,
  SimCloudFrontOriginRequestPolicy
>;
