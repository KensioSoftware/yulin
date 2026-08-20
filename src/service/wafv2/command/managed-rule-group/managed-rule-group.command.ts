import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimWafActionInput } from "../../web-acl/sim-waf-action.type.js";

/**
 * What a description reports about one rule of a managed group.
 */
export interface SimWafManagedRuleSummaryOutput {
  readonly Name: string;

  /** The action the rule takes unless an override says otherwise. */
  readonly Action: SimWafActionInput;
}

/**
 * One label a managed rule group can add.
 */
export interface SimWafLabelSummaryOutput {
  readonly Name: string;
}

/**
 * Minimal structural sim WAFv2 DescribeManagedRuleGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/wafv2/command/DescribeManagedRuleGroupCommand/
 */
export interface SimDescribeManagedRuleGroupCommand {
  readonly input: SimDescribeManagedRuleGroupCommandInput;
}

export interface SimDescribeManagedRuleGroupCommandInput {
  readonly VendorName?: string | undefined;
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly VersionName?: string | undefined;
}

export interface SimDescribeManagedRuleGroupCommandOutput {
  readonly Capacity?: number | undefined;
  readonly Rules?: readonly SimWafManagedRuleSummaryOutput[] | undefined;
  readonly LabelNamespace?: string | undefined;
  readonly AvailableLabels?: readonly SimWafLabelSummaryOutput[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
