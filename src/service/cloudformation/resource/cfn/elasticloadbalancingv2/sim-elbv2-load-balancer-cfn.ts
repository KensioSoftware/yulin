import type { SimElbV2LoadBalancer } from "../../../../elbv2/load-balancer/sim-elbv2-load-balancer.js";
import { simElbV2CanonicalHostedZoneId } from "../../../../elbv2/load-balancer/sim-elbv2-load-balancer-arn.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimElbV2LoadBalancerCfnProperties {
  readonly loadBalancer: SimElbV2LoadBalancer;
}

/**
 * CloudFormation-facing values for a simulated load balancer.
 */
export class SimElbV2LoadBalancerCfn implements SimCfnResourceValueAdapter {
  private readonly loadBalancer: SimElbV2LoadBalancer;

  constructor(properties: SimElbV2LoadBalancerCfnProperties) {
    this.loadBalancer = properties.loadBalancer;
  }

  /**
   * AWS::ElasticLoadBalancingV2::LoadBalancer Ref returns the ARN.
   *
   * That is what a listener's `LoadBalancerArn` takes, which is the reference
   * nearly every load balancer stack carries.
   */
  refValue(): SimCfnTemplateValue {
    return this.loadBalancer.arn;
  }

  /**
   * AWS::ElasticLoadBalancingV2::LoadBalancer attributes.
   *
   * `DNSName` is the one a stack does something with: a Route53 alias or a
   * CloudFront origin points at it, and here as on AWS that name is the only
   * way a request reaches the load balancer.
   *
   * `SecurityGroups` is a real attribute this cannot answer, because nothing
   * places a simulated load balancer behind a security group. It is refused
   * rather than answered with an empty list, which would read as a load
   * balancer that has none.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "DNSName": {
        return this.loadBalancer.dnsName;
      }
      case "LoadBalancerName": {
        return this.loadBalancer.name;
      }
      case "LoadBalancerFullName": {
        return simElbV2LoadBalancerFullName(this.loadBalancer);
      }
      case "CanonicalHostedZoneID": {
        return simElbV2CanonicalHostedZoneId;
      }
      default: {
        throw new Error(
          `Unsupported AWS::ElasticLoadBalancingV2::LoadBalancer attribute ${
            attributeName
          }`,
        );
      }
    }
  }
}

/**
 * The full name of a load balancer, which is the part of its ARN that names
 * it: `app/<name>/<id>`.
 *
 * It is what a CloudWatch metric dimension and an access log prefix carry,
 * where the ARN itself would not fit, so a stack reads it rather than building
 * it out of the name.
 */
function simElbV2LoadBalancerFullName(
  loadBalancer: SimElbV2LoadBalancer,
): string {
  const [, resource = ""] = loadBalancer.arn.split(":loadbalancer/", 2);

  return resource;
}
