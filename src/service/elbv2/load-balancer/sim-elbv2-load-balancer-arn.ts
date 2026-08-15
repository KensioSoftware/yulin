import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of one simulated Application Load Balancer.
 *
 * An ALB ARN names the load balancer type as well as the load balancer:
 * `arn:aws:elasticloadbalancing:<region>:<account>:loadbalancer/app/<name>/<id>`.
 * The `app/` part is what tells it apart from a network or gateway load
 * balancer, and everything derived from it, a listener ARN above all, carries
 * that part too.
 */
export function simElbV2LoadBalancerArn(
  name: string,
  id: string,
  scope: SimAwsAccountRegionScope,
): string {
  return (
    `arn:aws:elasticloadbalancing:${scope.regionName}:${scope.accountId}:` +
    `loadbalancer/app/${name}/${id}`
  );
}

/**
 * The Route53 hosted zone a load balancer's DNS name lives in.
 *
 * Real ELB has one of these per region, published by AWS and needed by an
 * alias record pointing at a load balancer. This simulation issues one value
 * everywhere instead of carrying that table, because simulated Route53
 * resolves an alias by looking the target up rather than by its zone id, so
 * only the shape is load bearing. A test copying this value into a real
 * template would be copying the wrong one.
 */
export const simElbV2CanonicalHostedZoneId = "Z0000000000000";
