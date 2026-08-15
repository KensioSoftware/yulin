import type { SimElbV2TargetGroup } from "../../../../elbv2/target-group/sim-elbv2-target-group.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimElbV2TargetGroupCfnProperties {
  readonly targetGroup: SimElbV2TargetGroup;
}

/**
 * CloudFormation-facing values for a simulated target group.
 */
export class SimElbV2TargetGroupCfn implements SimCfnResourceValueAdapter {
  private readonly targetGroup: SimElbV2TargetGroup;

  constructor(properties: SimElbV2TargetGroupCfnProperties) {
    this.targetGroup = properties.targetGroup;
  }

  /**
   * AWS::ElasticLoadBalancingV2::TargetGroup Ref returns the ARN.
   *
   * That is what a forward action names, which is how a listener or a rule
   * reaches a target group.
   */
  refValue(): SimCfnTemplateValue {
    return this.targetGroup.arn;
  }

  /**
   * AWS::ElasticLoadBalancingV2::TargetGroup attributes.
   *
   * `LoadBalancerArns` is a real attribute this cannot answer. Nothing records
   * on a target group which load balancers forward to it, because a rule can
   * be written and deleted without the group hearing about it, and the answer
   * is read back out of the listeners instead. `DescribeTargetGroups` reports
   * it, so a test that wants it has somewhere to read it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "TargetGroupArn": {
        return this.targetGroup.arn;
      }
      case "TargetGroupName": {
        return this.targetGroup.name;
      }
      case "TargetGroupFullName": {
        return simElbV2TargetGroupFullName(this.targetGroup);
      }
      default: {
        throw new Error(
          `Unsupported AWS::ElasticLoadBalancingV2::TargetGroup attribute ${
            attributeName
          }`,
        );
      }
    }
  }
}

/**
 * The full name of a target group, which is the part of its ARN that names it:
 * `targetgroup/<name>/<id>`.
 *
 * It is the other half of the CloudWatch metric dimension a load balancer's
 * full name is one half of.
 */
function simElbV2TargetGroupFullName(targetGroup: SimElbV2TargetGroup): string {
  const [, resource = ""] = targetGroup.arn.split(":targetgroup/", 2);

  return `targetgroup/${resource}`;
}
