import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2ListenerRuleView } from "../../listener/rule/sim-elbv2-listener-rule.js";
import type { SimElbV2RuleConditionInput } from "./rule-condition.command.js";
import type {
  SimElbV2ActionInput,
  SimElbV2Tag,
} from "../sim-elbv2-shared.command.js";

/**
 * Minimal structural sim ELBv2 CreateRule command.
 */
export interface SimCreateRuleCommand {
  readonly input: SimCreateRuleCommandInput;
}

/**
 * Minimal structural sim ELBv2 CreateRule input.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateRule.html
 */
export interface SimCreateRuleCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly Priority?: number | undefined;
  readonly Conditions?: readonly SimElbV2RuleConditionInput[] | undefined;
  readonly Actions?: readonly SimElbV2ActionInput[] | undefined;
  readonly Tags?: readonly SimElbV2Tag[] | undefined;
}

/**
 * Minimal structural sim ELBv2 CreateRule output.
 */
export interface SimCreateRuleCommandOutput {
  readonly Rules?: readonly SimElbV2ListenerRuleView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeRules command.
 */
export interface SimDescribeRulesCommand {
  readonly input: SimDescribeRulesCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeRules input.
 */
export interface SimDescribeRulesCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly RuleArns?: readonly string[] | undefined;
  readonly Marker?: string | undefined;
  readonly PageSize?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 DescribeRules output.
 */
export interface SimDescribeRulesCommandOutput {
  readonly Rules?: readonly SimElbV2ListenerRuleView[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 ModifyRule command.
 */
export interface SimModifyRuleCommand {
  readonly input: SimModifyRuleCommandInput;
}

/**
 * Minimal structural sim ELBv2 ModifyRule input.
 *
 * A priority is not here because real ELB does not take one: moving a rule is
 * `SetRulePriorities`, since it reorders a whole listener rather than changing
 * one rule.
 */
export interface SimModifyRuleCommandInput {
  readonly RuleArn?: string | undefined;
  readonly Conditions?: readonly SimElbV2RuleConditionInput[] | undefined;
  readonly Actions?: readonly SimElbV2ActionInput[] | undefined;
}

/**
 * Minimal structural sim ELBv2 ModifyRule output.
 */
export interface SimModifyRuleCommandOutput {
  readonly Rules?: readonly SimElbV2ListenerRuleView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DeleteRule command.
 */
export interface SimDeleteRuleCommand {
  readonly input: SimDeleteRuleCommandInput;
}

/**
 * Minimal structural sim ELBv2 DeleteRule input.
 */
export interface SimDeleteRuleCommandInput {
  readonly RuleArn?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 DeleteRule output.
 */
export interface SimDeleteRuleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 rule priority pair.
 */
export interface SimElbV2RulePriorityPair {
  readonly RuleArn?: string | undefined;
  readonly Priority?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 SetRulePriorities command.
 */
export interface SimSetRulePrioritiesCommand {
  readonly input: SimSetRulePrioritiesCommandInput;
}

/**
 * Minimal structural sim ELBv2 SetRulePriorities input.
 */
export interface SimSetRulePrioritiesCommandInput {
  readonly RulePriorities?: readonly SimElbV2RulePriorityPair[] | undefined;
}

/**
 * Minimal structural sim ELBv2 SetRulePriorities output.
 */
export interface SimSetRulePrioritiesCommandOutput {
  readonly Rules?: readonly SimElbV2ListenerRuleView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
