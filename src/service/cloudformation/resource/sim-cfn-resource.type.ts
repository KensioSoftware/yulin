import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import type { SimCfnBinding } from "../bind/sim-cfn-binding.js";
import type { SimCfnResource } from "./sim-cfn-resource.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";

export interface SimCloudFormationResourceProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly logicalId?: string;
  readonly stackName?: string | undefined;
  readonly template?: SimCfnTemplateValueRecord;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
  readonly parameters?: SimCfnParameters | undefined;
  readonly resourceLogicalIds?: ReadonlySet<string> | undefined;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Simulated CloudFormation Resource status.
 *
 * These states model the CloudFormation creation and deletion lifecycle for one
 * Resource entry, not the lifecycle of the underlying simulated AWS service
 * object.
 *
 * A Resource keeps its creation status until it is asked to delete, so a status
 * reads as the last thing CloudFormation did to the Resource.
 */
export type SimCloudFormationResourceStatus =
  | "CREATE_PENDING"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED"
  | "DELETE_IN_PROGRESS"
  | "DELETE_COMPLETE"
  | "DELETE_SKIPPED"
  | "DELETE_FAILED";

/**
 * What resolving one Resource's Properties needs from the operation running.
 *
 * Creation and deletion both resolve Properties against the Stack's other
 * Resources, and neither needs anything else of the operation to do it.
 */
export interface SimCfnResourceResolveContext {
  readonly resources: ReadonlyMap<string, SimCfnResource>;

  /**
   * The simulation the Stack is deploying into, for the values that come from
   * another service rather than from the template. A dynamic reference is one.
   */
  readonly simAws?: SimAws | undefined;

  /**
   * The principal the operation runs as, which a value read out of another
   * service is authorized as. Real CloudFormation reads a dynamic reference
   * under the Stack's execution role rather than as the Account root.
   *
   * Left out unless the deployment named one, which leaves each service to its
   * own omitted-caller default of the Account root.
   */
  readonly caller?: SimAwsCaller | undefined;
}

export interface SimCloudFormationResourceCreateContext {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly resolvedProperties?: SimCfnTemplateValueRecord | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /**
   * The principal the deployment runs as, which every service command creating
   * a Resource is authorized as.
   *
   * Left out unless the deployment named one, which leaves each service to its
   * own omitted-caller default: the Account root, as it is everywhere else in
   * the simulation.
   */
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * What a service is given to delete a Resource it created.
 *
 * The same shape as the creation context, minus the parts only creation has an
 * answer for. Properties are resolved again at deletion time rather than
 * remembered from creation, which works because a Stack tears down in reverse
 * dependency order: everything a Resource refers to is still there when the
 * Resource itself is deleted.
 */
export interface SimCloudFormationResourceDeleteContext {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly resolvedProperties?: SimCfnTemplateValueRecord | undefined;

  /** The principal the teardown runs as, as creation carries it. */
  readonly caller?: SimAwsCaller | undefined;
}
