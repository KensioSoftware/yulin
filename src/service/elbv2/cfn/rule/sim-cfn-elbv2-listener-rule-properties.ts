import type { SimElbV2RuleConditionInput } from "../../command/rule/rule-condition.command.js";
import type { SimCreateRuleCommandInput } from "../../command/rule/rule.command.js";
import type { SimElbV2ActionInput } from "../../command/sim-elbv2-shared.command.js";
import type { SimCfnElbV2DeclaredResource } from "../property/sim-cfn-elbv2-declared-resource.js";
import { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";
import { SimCfnElbV2PropertyRules } from "../property/sim-cfn-elbv2-property-rules.js";

/**
 * The properties a listener rule is created with, which is all of them.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "ListenerArn",
  "Priority",
  "Conditions",
  "Actions",
]);

/**
 * A listener rule declares nothing this simulation has to leave out.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map();

/**
 * Reads AWS::ElasticLoadBalancingV2::ListenerRule properties into CreateRule
 * input.
 *
 * `Conditions` and `Actions` are handed on in the shape the template wrote
 * them, so a declared condition is read by the same model an SDK caller's is.
 * A field this simulation does not match on is refused there, which is what
 * makes a template's rule behave the way the same rule created through the SDK
 * would.
 */
export class SimCfnElbV2ListenerRuleProperties {
  private readonly reader: SimCfnElbV2PropertyReader;
  private readonly rules: SimCfnElbV2PropertyRules;

  constructor(declared: SimCfnElbV2DeclaredResource) {
    const { resource, properties } = declared;

    this.reader = new SimCfnElbV2PropertyReader({ resource, properties });
    this.rules = new SimCfnElbV2PropertyRules({
      resourceTypeName: "ListenerRule",
      described: "rule",
      properties,
      ignorer: resource,
      actedOn: actedOnProperties,
      unsimulated: unsimulatedPropertyReasons,
    });
  }

  /**
   * The CreateRule input this Resource declares.
   */
  createRuleInput(): SimCreateRuleCommandInput {
    return {
      ListenerArn: this.reader.text("ListenerArn"),
      Priority: this.reader.number("Priority"),
      Conditions:
        this.reader.structures<SimElbV2RuleConditionInput>("Conditions"),
      Actions: this.reader.structures<SimElbV2ActionInput>("Actions"),
    };
  }

  /**
   * Record the properties the rule is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
