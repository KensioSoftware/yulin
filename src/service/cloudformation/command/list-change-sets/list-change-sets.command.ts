import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimCfnChangeSetExecutionStatus,
  SimCfnChangeSetStatus,
} from "../../changeset/sim-cfn-change-set.type.js";

/**
 * Minimal structural sim CloudFormation ListChangeSets command.
 */
export interface SimListChangeSetsCommand {
  readonly input: SimListChangeSetsCommandInput;
}

/**
 * Minimal structural sim CloudFormation ListChangeSets input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/ListChangeSetsCommand/
 */
export interface SimListChangeSetsCommandInput {
  readonly StackName?: string | undefined;
}

/**
 * Minimal structural sim CloudFormation ListChangeSets output.
 */
export interface SimListChangeSetsCommandOutput {
  readonly Summaries?: SimCfnChangeSetSummary[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFormation ChangeSetSummary.
 */
export interface SimCfnChangeSetSummary {
  readonly ChangeSetId?: string | undefined;
  readonly ChangeSetName?: string | undefined;
  readonly StackName?: string | undefined;
  readonly Description?: string | undefined;
  readonly Status?: SimCfnChangeSetStatus | undefined;
  readonly StatusReason?: string | undefined;
  readonly ExecutionStatus?: SimCfnChangeSetExecutionStatus | undefined;
}
