import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import { simCfnChangeSetArn } from "./sim-cfn-change-set-arn.js";
import type {
  SimCfnChangeSetExecutionStatus,
  SimCfnChangeSetName,
  SimCfnChangeSetStatus,
  SimCfnChangeSetType,
  SimCfnResourceChange,
} from "./sim-cfn-change-set.type.js";

interface SimCfnChangeSetProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly changeSetName: SimCfnChangeSetName;
  readonly stackName: SimCloudFormationStackName;
  readonly type: SimCfnChangeSetType;
  readonly template: SimCfnTemplate;
  readonly changes: readonly SimCfnResourceChange[];
  readonly description?: string | undefined;

  /** Why the change set failed, for one the simulator refused to build. */
  readonly failureReason?: string | undefined;
}

/**
 * One change set held against a simulated CloudFormation Stack.
 *
 * It holds the template it was created from and the Resource changes executing
 * it would make. The changes are worked out when the change set is created and
 * kept as they were, which is the point of a change set: what it reports is
 * what was true of the Stack at the moment it was asked for.
 *
 * Executing it belongs to SimCloudFormation. This class only records how far
 * that execution got.
 */
export class SimCfnChangeSet {
  public readonly changeSetId: string;
  public readonly changeSetName: SimCfnChangeSetName;
  public readonly stackName: SimCloudFormationStackName;
  public readonly type: SimCfnChangeSetType;
  public readonly template: SimCfnTemplate;
  public readonly changes: readonly SimCfnResourceChange[];
  public readonly description: string | undefined;

  /** How far the change set itself got. */
  public status: SimCfnChangeSetStatus;

  /** Why the change set is in the status it is in, where there is a reason. */
  public readonly statusReason: string | undefined;

  /** Whether the change set can be executed, and how execution went. */
  public executionStatus: SimCfnChangeSetExecutionStatus;

  constructor(properties: SimCfnChangeSetProperties) {
    const { changeSetName, failureReason } = properties;
    const built = failureReason === undefined;

    this.changeSetName = changeSetName;
    this.stackName = properties.stackName;
    this.type = properties.type;
    this.template = properties.template;
    this.changes = properties.changes;
    this.description = properties.description;
    this.changeSetId = simCfnChangeSetArn(
      properties.accountRegionScope,
      changeSetName,
    );

    this.status = built ? "CREATE_COMPLETE" : "FAILED";
    this.statusReason = failureReason;
    this.executionStatus = built ? "AVAILABLE" : "UNAVAILABLE";
  }

  /** Whether ExecuteChangeSet will take this change set. */
  public get executable(): boolean {
    return this.executionStatus === "AVAILABLE";
  }
}
