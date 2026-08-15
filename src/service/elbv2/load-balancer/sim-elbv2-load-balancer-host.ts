import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimElbV2LoadBalancerScheme } from "./sim-elbv2-load-balancer-scheme.js";

/**
 * The DNS label ELB puts between the Region and the AWS domain in the host
 * name it issues for a load balancer:
 *
 *   <name>-<id>.<region>.elb.amazonaws.com
 */
export const simElbV2HostLabel = "elb";

/**
 * The real AWS domain load balancer host names live under.
 *
 * Unlike the endpoints the SDK talks to, this domain is not dropped when the
 * name is served locally. Nothing signs a request to a load balancer, so the
 * host name a client writes is the one `DNSName` reported, and reading it back
 * is what lets a Route53 alias be written with that value unchanged.
 */
export const simElbV2HostDomain = "amazonaws.com";

/**
 * The prefix real ELB puts on the DNS name of an internal load balancer.
 */
const internalPrefix = "internal-";

/**
 * A load balancer host name taken apart.
 */
export interface SimElbV2LoadBalancerHost {
  /** The host name, in the lower case host names are compared in. */
  readonly dnsName: string;
  /** The Region label the host name carries. */
  readonly regionName: string;
}

/**
 * The shape of a load balancer host name: the load balancer's own label, the
 * Region, and the ELB domain.
 */
const loadBalancerHost =
  /^[\da-z][\da-z-]*\.(?<regionName>[\da-z-]+)\.elb\.amazonaws\.com$/u;

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
  const prefix = scheme === "internal" ? internalPrefix : "";

  return (
    `${prefix}${name}-${suffix}.${scope.regionName}.` +
    `${simElbV2HostLabel}.${simElbV2HostDomain}`
  );
}

/**
 * Read a host name that names a load balancer, or nothing if it names
 * something else.
 *
 * This is the reading half of `simElbV2LoadBalancerDnsName`, and it is what
 * tells Route53 resolution that a name is a load balancer's rather than
 * another service's. It says only that the name has the shape ELB issues: which
 * load balancer answers on it, and whether one still does, is the registry's
 * answer rather than this one's, the same as for every other simulated service
 * host name.
 */
export function readSimElbV2LoadBalancerHost(
  hostname: string,
): SimElbV2LoadBalancerHost | undefined {
  const dnsName = hostname.toLowerCase();
  const regionName = loadBalancerHost.exec(dnsName)?.groups?.["regionName"];

  if (regionName === undefined) {
    return undefined;
  }

  return { dnsName, regionName };
}
