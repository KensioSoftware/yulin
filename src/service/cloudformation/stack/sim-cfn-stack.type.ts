import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import type { SimCfnBinding } from "../bind/sim-cfn-binding.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import type { SimCfnResourceOrder } from "./deploy/sim-cfn-resource-order.js";
import type { SimCfnStackId } from "./sim-cfn-stack-id.js";

export type SimCloudFormationStackName = Brand<
  string,
  "SimCloudFormationStackName"
>;

export type SimCloudFormationStackStatus =
  | "REVIEW_IN_PROGRESS"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED"
  | "UPDATE_IN_PROGRESS"
  | "UPDATE_COMPLETE"
  | "UPDATE_FAILED"
  | "UPDATE_ROLLBACK_IN_PROGRESS"
  | "UPDATE_ROLLBACK_COMPLETE"
  | "UPDATE_ROLLBACK_FAILED"
  | "DELETE_IN_PROGRESS"
  | "DELETE_COMPLETE"
  | "DELETE_FAILED";

export interface SimCfnStackUpdateProperties {
  /**
   * The CDK cloud assembly the new template was synthesized into, when it came
   * from a template file that has been synthesized again. The Stack reads
   * assets from it from then on, since the manifest it was deployed with
   * describes the assembly the previous template came from.
   */
  readonly cdkOutContext?: SimCdkOutContext | undefined;

  /**
   * The principal to apply the new template as, for an update that names one.
   * The Stack goes on using it, as it does the cloud assembly.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The principal to publish the re-synthesized file assets as, for an update
   * that names one. The Stack goes on using it too.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;
}

export interface SimCloudFormationStackProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;

  /**
   * The unique ID this Stack was created with, which is what a deleted Stack
   * is still described by once its name has gone back into circulation.
   */
  readonly stackId: SimCfnStackId;

  readonly template: SimCfnTemplate;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /**
   * The principal this Stack's Resources are created, updated and deleted as.
   * An omitted caller is the Account root, as it is everywhere else in the
   * simulation.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The principal the CDK file assets staged beside the template are published
   * as.
   *
   * A real `cdk deploy` publishes them as the file publishing Role and only
   * then processes the template as the execution Role, which is why the two
   * are named apart. Left out, assets are published as `caller`.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;

  /**
   * The order this Stack starts Resources with no dependency between them in.
   * The template's own order unless the deployment asked for another one.
   */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;

  /**
   * The export names published in the Account and Region this Stack deploys
   * into. This Stack publishes its own Outputs here and reads the ones its
   * `Fn::ImportValue` expressions name.
   */
  readonly exports?: SimCfnExports | undefined;
}
