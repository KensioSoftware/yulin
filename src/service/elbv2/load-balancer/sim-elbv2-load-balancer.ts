import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  simElbV2CanonicalHostedZoneId,
  simElbV2LoadBalancerArn,
  simElbV2LoadBalancerDnsName,
} from "./sim-elbv2-load-balancer-arn.js";
import type { SimElbV2LoadBalancerScheme } from "./sim-elbv2-load-balancer-scheme.js";

interface SimElbV2LoadBalancerProperties {
  readonly name: string;
  readonly scheme: SimElbV2LoadBalancerScheme;
  readonly ipAddressType: string;
  readonly id: string;
  readonly dnsSuffix: string;
  readonly createdTime: Date;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a load balancer is reported once it is ready to take requests.
 */
export interface SimElbV2LoadBalancerStateView {
  readonly Code: string;
}

/**
 * A simulated load balancer as the SDK reads it back.
 */
export interface SimElbV2LoadBalancerView {
  readonly LoadBalancerArn: string;
  readonly LoadBalancerName: string;
  readonly DNSName: string;
  readonly CanonicalHostedZoneId: string;
  readonly CreatedTime: Date;
  readonly Scheme: SimElbV2LoadBalancerScheme;
  readonly Type: string;
  readonly State: SimElbV2LoadBalancerStateView;
  readonly IpAddressType: string;
}

/**
 * One simulated Application Load Balancer.
 *
 * The interesting part of it is the DNS name, which is the only way anything
 * reaches a load balancer on real AWS: a Route53 alias or a CloudFront origin
 * points at that name rather than at the ARN. Everything else here exists so
 * that what a describe reports is what a real describe would have.
 *
 * A load balancer created here is `active` at once. Real ELB leaves one
 * `provisioning` for a few minutes first, and waiting that out would cost
 * every test the same minutes for no behaviour it could observe.
 */
export class SimElbV2LoadBalancer {
  public readonly name: string;
  public readonly arn: string;
  public readonly dnsName: string;
  public readonly scheme: SimElbV2LoadBalancerScheme;
  public readonly ipAddressType: string;
  public readonly createdTime: Date;

  constructor(properties: SimElbV2LoadBalancerProperties) {
    const { name, scheme, accountRegionScope } = properties;

    this.name = name;
    this.scheme = scheme;
    this.ipAddressType = properties.ipAddressType;
    this.createdTime = properties.createdTime;
    this.arn = simElbV2LoadBalancerArn(name, properties.id, accountRegionScope);
    this.dnsName = simElbV2LoadBalancerDnsName(
      name,
      properties.dnsSuffix,
      scheme,
      accountRegionScope,
    );
  }

  /**
   * Report this load balancer in the shape the SDK reads it back in.
   *
   * Subnets, security groups and availability zones are left out rather than
   * invented: nothing declares them to this simulation, so reporting an empty
   * list is the honest answer and reporting a made-up one would not be.
   */
  view(): SimElbV2LoadBalancerView {
    return {
      LoadBalancerArn: this.arn,
      LoadBalancerName: this.name,
      DNSName: this.dnsName,
      CanonicalHostedZoneId: simElbV2CanonicalHostedZoneId,
      CreatedTime: this.createdTime,
      Scheme: this.scheme,
      Type: "application",
      State: { Code: "active" },
      IpAddressType: this.ipAddressType,
    };
  }
}
