import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimElbV2ListenerRule } from "../../listener/rule/sim-elbv2-listener-rule.js";
import type { SimElbV2 } from "../../sim-elbv2.js";
import type { SimElbV2Stores } from "../../sim-elbv2-stores.js";
import { SimCfnElbV2ListenerRuleProperties } from "./sim-cfn-elbv2-listener-rule-properties.js";

interface SimCfnElbV2ListenerRuleCreatorProperties {
  readonly elbV2: SimElbV2;
  readonly stores: SimElbV2Stores;
}

/**
 * Creates simulated rules from AWS::ElasticLoadBalancingV2::ListenerRule
 * Resources.
 *
 * Two rules on one listener at the same priority are refused, as they are
 * through the SDK, because priority is what decides which of two matching
 * rules claims a request. A stack that declares both is a stack whose routing
 * has no defined outcome.
 */
export class SimCfnElbV2ListenerRuleCreator {
  private readonly elbV2: SimElbV2;
  private readonly stores: SimElbV2Stores;

  constructor(properties: SimCfnElbV2ListenerRuleCreatorProperties) {
    this.elbV2 = properties.elbV2;
    this.stores = properties.stores;
  }

  /**
   * Create a rule from a ListenerRule Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimElbV2ListenerRule> {
    const declared = new SimCfnElbV2ListenerRuleProperties({
      resource,
      properties,
    });
    const input = declared.createRuleInput();

    declared.recordIgnoredProperties();

    const created = await this.elbV2.createRule({ input });
    const ruleArn = created.Rules?.[0]?.RuleArn;

    assertDefined(
      ruleArn,
      `sim ELBv2 rule ARN after CloudFormation creation for ${
        resource.logicalId
      }`,
    );

    return this.stores.rules.requireByArn(ruleArn);
  }

  /**
   * Delete a rule created from a ListenerRule Resource.
   */
  async delete(rule: SimElbV2ListenerRule): Promise<void> {
    await this.elbV2.deleteRule({ input: { RuleArn: rule.arn } });
  }
}
