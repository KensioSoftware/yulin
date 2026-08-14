import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimElbV2LoadBalancerScheme } from "./sim-elbv2-load-balancer-scheme.js";

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
 * The DNS name real ELB issues for a load balancer.
 *
 * This is the whole point of creating one here: a Route53 alias or a CloudFront
 * origin needs a host name of the right shape to point at, and it is the only
 * name by which anything reaches a load balancer on real AWS. An internal load
 * balancer's name carries the `internal-` prefix real ELB gives it, which is
 * why that prefix is refused in a load balancer's own name.
 */
export function simElbV2LoadBalancerDnsName(
  name: string,
  suffix: string,
  scheme: SimElbV2LoadBalancerScheme,
  scope: SimAwsAccountRegionScope,
): string {
  const prefix = scheme === "internal" ? "internal-" : "";

  return `${prefix}${name}-${suffix}.${scope.regionName}.elb.amazonaws.com`;
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
