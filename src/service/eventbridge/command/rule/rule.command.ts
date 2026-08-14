import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEventBridgeTag } from "../bus/bus.command.js";

/**
 * One rule as a listing reports it.
 */
export interface SimListedRule {
  readonly Name: string;
  readonly Arn: string;
  readonly EventPattern?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly State: string;
  readonly Description?: string | undefined;
  readonly EventBusName: string;
}

/**
 * Minimal structural sim EventBridge PutRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/PutRuleCommand/
 */
export interface SimPutRuleCommand {
  readonly input: SimPutRuleCommandInput;
}

export interface SimPutRuleCommandInput {
  readonly Name?: string | undefined;
  readonly EventPattern?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly RoleArn?: string | undefined;
  readonly Tags?: readonly SimEventBridgeTag[] | undefined;
}

export interface SimPutRuleCommandOutput {
  readonly RuleArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge DeleteRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DeleteRuleCommand/
 */
export interface SimDeleteRuleCommand {
  readonly input: SimDeleteRuleCommandInput;
}

export interface SimDeleteRuleCommandInput {
  readonly Name?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Force?: boolean | undefined;
}

export interface SimDeleteRuleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge DescribeRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DescribeRuleCommand/
 */
export interface SimDescribeRuleCommand {
  readonly input: SimDescribeRuleCommandInput;
}

export interface SimDescribeRuleCommandInput {
  readonly Name?: string | undefined;
  readonly EventBusName?: string | undefined;
}

export interface SimDescribeRuleCommandOutput {
  readonly Name?: string | undefined;
  readonly Arn?: string | undefined;
  readonly EventPattern?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge ListRules command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/ListRulesCommand/
 */
export interface SimListRulesCommand {
  readonly input: SimListRulesCommandInput;
}

export interface SimListRulesCommandInput {
  readonly NamePrefix?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListRulesCommandOutput {
  readonly Rules?: readonly SimListedRule[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge EnableRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/EnableRuleCommand/
 */
export interface SimEnableRuleCommand {
  readonly input: SimEnableRuleCommandInput;
}

export interface SimEnableRuleCommandInput {
  readonly Name?: string | undefined;
  readonly EventBusName?: string | undefined;
}

export interface SimEnableRuleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge DisableRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DisableRuleCommand/
 */
export interface SimDisableRuleCommand {
  readonly input: SimDisableRuleCommandInput;
}

export interface SimDisableRuleCommandInput {
  readonly Name?: string | undefined;
  readonly EventBusName?: string | undefined;
}

export interface SimDisableRuleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge TestEventPattern command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/TestEventPatternCommand/
 */
export interface SimTestEventPatternCommand {
  readonly input: SimTestEventPatternCommandInput;
}

export interface SimTestEventPatternCommandInput {
  readonly EventPattern?: string | undefined;
  readonly Event?: string | undefined;
}

export interface SimTestEventPatternCommandOutput {
  readonly Result?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}
