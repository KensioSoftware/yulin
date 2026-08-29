import type { SimCloudFront } from "../../sim-cloudfront.js";

/**
 * One kind of policy a Behavior names, in the terms a template writes it in,
 * with the way this simulation is asked whether it holds one and what the
 * Behavior loses along with it.
 */
export interface BehaviorPolicyKind {
  readonly property:
    | "ResponseHeadersPolicyId"
    | "CachePolicyId"
    | "OriginRequestPolicyId";
  readonly name: string;
  readonly loses: string;
  readonly held: (cloudFront: SimCloudFront, policyId: string) => boolean;
}

/**
 * The three policies a Behavior names outside itself.
 */
export const behaviorPolicyKinds: readonly BehaviorPolicyKind[] = [
  {
    property: "ResponseHeadersPolicyId",
    name: "response headers policy",
    loses:
      "serves every response without the headers that policy would have set",
    held: (cloudFront, policyId) =>
      cloudFront.getResponseHeadersPolicyById(policyId) !== undefined,
  },
  {
    property: "CachePolicyId",
    name: "cache policy",
    loses: "reports no CachePolicyId",
    held: (cloudFront, policyId) =>
      cloudFront.getCachePolicyById(policyId) !== undefined,
  },
  {
    property: "OriginRequestPolicyId",
    name: "origin request policy",
    loses: "reports no OriginRequestPolicyId",
    held: (cloudFront, policyId) =>
      cloudFront.getOriginRequestPolicyById(policyId) !== undefined,
  },
];
