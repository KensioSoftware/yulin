import type { SimElbV2ListenerRule } from "../../../../elbv2/listener/rule/sim-elbv2-listener-rule.js";
import type { SimElbV2Listener } from "../../../../elbv2/listener/sim-elbv2-listener.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimElbV2ListenerCfnProperties {
  readonly listener: SimElbV2Listener;
}

/**
 * CloudFormation-facing values for a simulated listener.
 */
export class SimElbV2ListenerCfn implements SimCfnResourceValueAdapter {
  private readonly listener: SimElbV2Listener;

  constructor(properties: SimElbV2ListenerCfnProperties) {
    this.listener = properties.listener;
  }

  /**
   * AWS::ElasticLoadBalancingV2::Listener Ref returns the ARN.
   *
   * That is what a rule's `ListenerArn` takes, so a stack declaring rules on a
   * listener refers to it this way.
   */
  refValue(): SimCfnTemplateValue {
    return this.listener.arn;
  }

  /**
   * AWS::ElasticLoadBalancingV2::Listener attributes.
   *
   * `ListenerArn` is the only one, and it answers with the same ARN Ref does.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName !== "ListenerArn") {
      throw new Error(
        `Unsupported AWS::ElasticLoadBalancingV2::Listener attribute ${
          attributeName
        }`,
      );
    }

    return this.listener.arn;
  }
}

interface SimElbV2ListenerRuleCfnProperties {
  readonly rule: SimElbV2ListenerRule;
}

/**
 * CloudFormation-facing values for a simulated listener rule.
 *
 * It sits beside the listener adapter because the two are the same three lines
 * about the same ARN, and a rule has nothing else a template can read.
 */
export class SimElbV2ListenerRuleCfn implements SimCfnResourceValueAdapter {
  private readonly rule: SimElbV2ListenerRule;

  constructor(properties: SimElbV2ListenerRuleCfnProperties) {
    this.rule = properties.rule;
  }

  /**
   * AWS::ElasticLoadBalancingV2::ListenerRule Ref returns the ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.rule.arn;
  }

  /**
   * AWS::ElasticLoadBalancingV2::ListenerRule attributes.
   *
   * `IsDefault` is always false. A listener's default action is the listener
   * rather than a rule, so nothing a template declares as a ListenerRule can
   * be the default one.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "RuleArn": {
        return this.rule.arn;
      }
      case "IsDefault": {
        return false;
      }
      default: {
        throw new Error(
          `Unsupported AWS::ElasticLoadBalancingV2::ListenerRule attribute ${
            attributeName
          }`,
        );
      }
    }
  }
}
