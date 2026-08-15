import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTargetParametersType } from "../../../ecs/target/sim-ecs-target-parameters.js";

/**
 * One target as a request carries it, and as ListTargetsByRule reports it.
 *
 * The properties beyond `Id`, `Arn`, `Input`, `RoleArn` and `EcsParameters`
 * are the ones real EventBridge takes and this simulation refuses, kept in the
 * shape so a request carrying one is recognised and named rather than ignored.
 */
export interface SimEventBridgeTarget {
  readonly Id?: string | undefined;
  readonly Arn?: string | undefined;
  readonly Input?: string | undefined;
  readonly InputPath?: string | undefined;
  readonly InputTransformer?: object | undefined;
  readonly RoleArn?: string | undefined;
  readonly DeadLetterConfig?: object | undefined;
  readonly RetryPolicy?: object | undefined;
  readonly SqsParameters?: object | undefined;
  readonly KinesisParameters?: object | undefined;
  readonly EcsParameters?: SimEcsTargetParametersType | undefined;
  readonly BatchParameters?: object | undefined;
  readonly HttpParameters?: object | undefined;
  readonly RunCommandParameters?: object | undefined;
  readonly RedshiftDataParameters?: object | undefined;
  readonly SageMakerPipelineParameters?: object | undefined;
  readonly AppSyncParameters?: object | undefined;
}

/**
 * One target a request could not add or remove, and why.
 */
export interface SimEventBridgeTargetFailure {
  readonly TargetId?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

/**
 * Minimal structural sim EventBridge PutTargets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/PutTargetsCommand/
 */
export interface SimPutTargetsCommand {
  readonly input: SimPutTargetsCommandInput;
}

export interface SimPutTargetsCommandInput {
  readonly Rule?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Targets?: readonly SimEventBridgeTarget[] | undefined;
}

export interface SimPutTargetsCommandOutput {
  readonly FailedEntryCount?: number | undefined;
  readonly FailedEntries?: readonly SimEventBridgeTargetFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge RemoveTargets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/RemoveTargetsCommand/
 */
export interface SimRemoveTargetsCommand {
  readonly input: SimRemoveTargetsCommandInput;
}

export interface SimRemoveTargetsCommandInput {
  readonly Rule?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Ids?: readonly string[] | undefined;
  readonly Force?: boolean | undefined;
}

export interface SimRemoveTargetsCommandOutput {
  readonly FailedEntryCount?: number | undefined;
  readonly FailedEntries?: readonly SimEventBridgeTargetFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge ListTargetsByRule command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/ListTargetsByRuleCommand/
 */
export interface SimListTargetsByRuleCommand {
  readonly input: SimListTargetsByRuleCommandInput;
}

export interface SimListTargetsByRuleCommandInput {
  readonly Rule?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListTargetsByRuleCommandOutput {
  readonly Targets?: readonly SimEventBridgeTarget[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge ListRuleNamesByTarget command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/ListRuleNamesByTargetCommand/
 */
export interface SimListRuleNamesByTargetCommand {
  readonly input: SimListRuleNamesByTargetCommandInput;
}

export interface SimListRuleNamesByTargetCommandInput {
  readonly TargetArn?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListRuleNamesByTargetCommandOutput {
  readonly RuleNames?: readonly string[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
