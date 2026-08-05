import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import type { SimCfnExecutableResourceBinding } from "../bind/sim-cfn-exec-binding.type.js";
import type { SimCfnResource } from "./sim-cfn-resource.js";

export interface SimCloudFormationResourceProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly logicalId?: string;
  readonly stackName?: string | undefined;
  readonly template?: SimCfnTemplateValueRecord;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
  readonly parameters?: SimCfnParameters | undefined;
  readonly resourceLogicalIds?: ReadonlySet<string> | undefined;
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
  | "DELETE_FAILED";

/**
 * What resolving one Resource's Properties needs from the operation running.
 *
 * Creation and deletion both resolve Properties against the Stack's other
 * Resources, and neither needs anything else of the operation to do it.
 */
export interface SimCfnResourceResolveContext {
  readonly resources: ReadonlyMap<string, SimCfnResource>;
}

export interface SimCloudFormationResourceCreateContext {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly resolvedProperties?: SimCfnTemplateValueRecord | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
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
}
