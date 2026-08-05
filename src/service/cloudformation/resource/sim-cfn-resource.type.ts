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
 * These states model the CloudFormation creation lifecycle for one Resource
 * entry, not the lifecycle of the underlying simulated AWS service object.
 */
export type SimCloudFormationResourceStatus =
  "CREATE_PENDING" | "CREATE_IN_PROGRESS" | "CREATE_COMPLETE" | "CREATE_FAILED";

export interface SimCloudFormationResourceCreateContext {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly resolvedProperties?: SimCfnTemplateValueRecord | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}
