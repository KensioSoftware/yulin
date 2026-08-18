import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import type { SimCfnDeployBinding } from "../bind/sim-cfn-deploy-binding.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";

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
}

export interface SimCloudFormationStackProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
  readonly template: SimCfnTemplate;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;

  /**
   * The export names published in the Account and Region this Stack deploys
   * into. This Stack publishes its own Outputs here and reads the ones its
   * `Fn::ImportValue` expressions name.
   */
  readonly exports?: SimCfnExports | undefined;
}
