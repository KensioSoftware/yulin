import type { Brand } from "../../../util/brand.type.js";

export type SimCfnChangeSetName = Brand<string, "SimCfnChangeSetName">;

/**
 * How far the change set itself has got.
 *
 * A change set the simulator refused to build lands in `FAILED` carrying the
 * reason, which is what CloudFormation does with a change set describing no
 * change at all.
 */
export type SimCfnChangeSetStatus =
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "DELETE_COMPLETE"
  | "FAILED";

/**
 * Whether the change set can be executed, and how the execution went.
 *
 * `OBSOLETE` is what a change set becomes once another one against the same
 * Stack has been executed, because the plan it holds was worked out against a
 * Stack that has moved on.
 */
export type SimCfnChangeSetExecutionStatus =
  | "UNAVAILABLE"
  | "AVAILABLE"
  | "EXECUTE_IN_PROGRESS"
  | "EXECUTE_COMPLETE"
  | "EXECUTE_FAILED"
  | "OBSOLETE";

/**
 * Whether executing the change set creates the Stack or updates it.
 */
export type SimCfnChangeSetType = "CREATE" | "UPDATE";

export type SimCfnResourceChangeAction = "Add" | "Modify" | "Remove";

/**
 * One Resource a change set would create, replace or delete.
 *
 * `replacement` is `True` on every `Modify`. Simulated CloudFormation replaces
 * a changed Resource, so a modification it reports is always a replacement.
 */
export interface SimCfnResourceChange {
  readonly action: SimCfnResourceChangeAction;
  readonly logicalResourceId: string;
  readonly resourceType: string | undefined;
  readonly replacement: "True" | undefined;
}
