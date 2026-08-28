import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEventRule } from "../../rule/sim-event-rule.js";
import type { SimEventBridge } from "../../sim-event-bridge.js";
import { simCfnEventBridgeResourceCreation } from "../sim-cfn-event-bridge-resource-error.js";
import { eventRuleResourceType } from "../sim-cfn-event-bridge-resource-types.js";
import { SimCfnEventRuleProperties } from "./sim-cfn-event-rule-properties.js";
import type { SimCfnEventRuleTarget } from "./sim-cfn-event-rule-targets.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnEventRuleCreatorProperties {
  readonly eventBridge: SimEventBridge;
}

/**
 * Creates simulated rules from AWS::Events::Rule Resources.
 *
 * The rule and its targets go through the ordinary PutRule and PutTargets
 * commands rather than being constructed directly, so a rule a template
 * deployed is the same thing an SDK caller would have got: the same pattern
 * parsing, the same schedule expression rules, and the same refusals.
 *
 * A rule's `Targets` are inline in the template rather than a Resource of their
 * own, the same way an SNS topic's subscriptions can be, so they are created
 * here as part of the rule rather than reaching CloudFormation separately.
 */
export class SimCfnEventRuleCreator {
  private readonly eventBridge: SimEventBridge;

  constructor(properties: SimCfnEventRuleCreatorProperties) {
    this.eventBridge = properties.eventBridge;
  }

  /**
   * Create a rule, and its targets, from an AWS::Events::Rule Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimEventRule> {
    const ruleProperties = new SimCfnEventRuleProperties({
      resource,
      properties,
    });

    ruleProperties.refuseUnsimulated();

    const name = ruleProperties.name();
    const busName = ruleProperties.busName();
    const targets = ruleProperties.targets();

    return await simCfnEventBridgeResourceCreation(
      eventRuleResourceType,
      resource.logicalId,
      async () => {
        await this.eventBridge.putRule(
          {
            input: {
              Name: name,
              EventBusName: busName,
              EventPattern: ruleProperties.eventPattern(),
              ScheduleExpression: ruleProperties.scheduleExpression(),
              State: ruleProperties.state(),
              Description: ruleProperties.description(),
            },
          },
          options,
        );

        await this.putTargets(name, busName, targets, options);

        const rule = this.eventBridge.findRule(name, busName);

        assertDefined(
          rule,
          `sim EventBridge rule ${name} after CloudFormation creation`,
        );

        return rule;
      },
    );
  }

  /**
   * Add everything the rule's own `Targets` list declares.
   */
  private async putTargets(
    ruleName: string,
    busName: string | undefined,
    targets: readonly SimCfnEventRuleTarget[],
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }

    await this.eventBridge.putTargets(
      {
        input: {
          Rule: ruleName,
          EventBusName: busName,
          Targets: targets.map((target) => ({
            Id: target.Id,
            Arn: target.Arn,
            Input: target.Input,
          })),
        },
      },
      options,
    );
  }
}
