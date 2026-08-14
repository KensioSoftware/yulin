import type { SimEventRule } from "../../../../eventbridge/rule/sim-event-rule.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEventRuleCfnProperties {
  readonly rule: SimEventRule;
}

/**
 * CloudFormation-facing values for a simulated rule.
 */
export class SimEventRuleCfn implements SimCfnResourceValueAdapter {
  private readonly rule: SimEventRule;

  constructor(properties: SimEventRuleCfnProperties) {
    this.rule = properties.rule;
  }

  /**
   * AWS::Events::Rule Ref returns the rule name, not its ARN.
   *
   * AWS documents this as the "rule ID", which for an unnamed rule is the name
   * CloudFormation generated for it, such as `mystack-ScheduledRule-ABC123`.
   * A template wanting the ARN, as an `AWS::Lambda::Permission` `SourceArn`
   * does, has to ask for it with `Fn::GetAtt`.
   */
  refValue(): SimCfnTemplateValue {
    return this.rule.name.value;
  }

  /**
   * AWS::Events::Rule attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.rule.arn;
    }

    throw new Error(`Unsupported AWS::Events::Rule attribute ${attributeName}`);
  }
}
