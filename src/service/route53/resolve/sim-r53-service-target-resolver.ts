import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { readSimHttpApiDomainEndpointHost } from "../../apigatewayv2/domain/sim-http-api-domain-endpoint.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { readSimElbV2LoadBalancerHost } from "../../elbv2/load-balancer/sim-elbv2-load-balancer-host.js";
import { simRoute53LogicalName } from "../local-name/sim-route53-local-name.js";
import { simRoute53DnsHostName } from "../serve/sim-route53-dns-host.js";
import { SimRoute53RegionalServiceTargets } from "./sim-r53-regional-service-target.js";
import { SimRoute53S3ServiceTargets } from "./sim-r53-s3-service-target.js";

const cloudFrontServiceLabel = "cloudfront";

/**
 * Maps Yulin-local service hostnames to simulated AWS service targets.
 *
 * Route53 resolution can end in one of two ways:
 *
 * 1. A record chain points at another Route53 name and resolution continues.
 * 2. A record chain reaches a hostname that is owned by a simulated AWS service.
 *
 * This class handles the second case. Keeping these hostname formats here makes
 * the Route53 resolver easier to read because the resolver only has to follow
 * records and ask this mapper whether the current name is a terminal service
 * target.
 
 */
export class SimRoute53ServiceTargetResolver {
  private readonly s3Targets = new SimRoute53S3ServiceTargets();
  private readonly regionalTargets = new SimRoute53RegionalServiceTargets();

  /**
   * Convert a Yulin-local hostname into a simulated service target.
   *
   * The incoming hostname may include the local Route53 suffix used by the HTTP
   * server. `simRoute53LogicalName` strips that suffix and returns the logical DNS
   * name that simulated AWS services expose.
   */
  resolve(hostname: string): SimAwsServiceTarget | undefined {
    const logicalName = simRoute53LogicalName(hostname);
    /* v8 ignore if -- defensive check */
    if (logicalName === undefined) {
      return undefined;
    }

    return (
      this.route53DnsServiceTarget(logicalName) ??
      this.s3Targets.resolve(logicalName) ??
      this.cloudFrontServiceTarget(logicalName) ??
      this.loadBalancerServiceTarget(logicalName) ??
      this.apiGatewayDomainServiceTarget(logicalName) ??
      this.regionalTargets.resolve(logicalName)
    );
  }

  /**
   * Resolve the regional endpoint hostname of an API Gateway custom domain:
   *
   *   d-<id>.execute-api.<region>.amazonaws.com
   *
   * This is read ahead of the endpoints below, because a domain endpoint and
   * the endpoint of an API have the same shape and only the `d-` prefix tells
   * them apart. The whole hostname is the resource name, since the domain
   * registry answers about both of the names a domain has and the custom
   * domain name is a hostname too.
   */
  private apiGatewayDomainServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const endpoint = readSimHttpApiDomainEndpointHost(logicalName);

    if (endpoint === undefined) {
      return undefined;
    }

    return {
      service: "apiGatewayDomain",
      resourceName: endpoint.logicalHost,
      regionName: endpoint.regionName as AwsRegionName,
    };
  }

  /**
   * Resolve Yulin's own Route53 introspection hostname.
   *
   * This is checked first so the hosted-zone summary stays reachable whatever
   * records a test has created, in the same way the built-in service hostnames
   * below cannot be shadowed by hosted-zone records.
   */
  private route53DnsServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    if (logicalName !== simRoute53DnsHostName) {
      return undefined;
    }

    return {
      service: "route53",
      resourceName: simRoute53DnsHostName,
    };
  }

  /**
   * Resolve CloudFront distribution hostnames.
   *
   * Simulated CloudFront hostnames use:
   *
   *   <distribution-id>.cloudfront.net
   *
   * Unlike S3 bucket website names, this format has an exact label count because
   * the distribution id is represented by one DNS label.
   */
  private cloudFrontServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length !== 3) {
      return undefined;
    }

    const [distroId, service, topLevelDomain] = labels;

    if (service !== cloudFrontServiceLabel || topLevelDomain !== "net") {
      return undefined;
    }

    /* v8 ignore if -- defensive check */
    if (distroId === undefined || distroId.length === 0) {
      return undefined;
    }

    return {
      service: "cloudFront",
      resourceName: distroId,
    };
  }

  /**
   * Resolve Application Load Balancer hostnames.
   *
   * Simulated load balancer hostnames use the name real ELB issues, whole:
   *
   *   <name>-<id>.<region>.elb.amazonaws.com
   *
   * The AWS domain is kept rather than dropped, unlike the SDK endpoints,
   * because nothing rewrites this name on its way in: `DNSName` is what a
   * Route53 alias points at and what a client asks for, so it is also what is
   * recognised here.
   *
   * The name says only that a load balancer would answer on it. Whether one
   * still does is answered when the request is routed, so a name pointing at a
   * deleted load balancer says that rather than resolving to nothing at all.
   */
  private loadBalancerServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const host = readSimElbV2LoadBalancerHost(logicalName);

    if (host === undefined) {
      return undefined;
    }

    return {
      service: "elbV2",
      resourceName: host.dnsName,
      regionName: host.regionName as AwsRegionName,
    };
  }
}
