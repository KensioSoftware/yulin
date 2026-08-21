import type { SimAws } from "../service/aws/sim-aws.js";
import type { SimCfnDeployBinding } from "../service/cloudformation/bind/sim-cfn-deploy-binding.js";
import type { SimCfnDeployedStack } from "../service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCloudFormationStackName } from "../service/cloudformation/stack/sim-cfn-stack.type.js";
import { cfnTemplateFromTerraformPlan } from "./sim-tf-import.js";
import {
  readTerraformPlanFile,
  terraformStackNameFromPlanPath,
} from "./sim-tf-plan-file.js";
import type { TerraformPlanOverride } from "./sim-tf-override.type.js";
import type { TerraformImportReport } from "./sim-tf-report.type.js";

export interface TerraformPlanDeployProperties {
  /**
   * The path of a JSON plan, as `terraform show -json <planfile>` writes one.
   *
   * The saved plan file itself is Terraform's own binary format and is not
   * what this reads.
   */
  readonly planPath: string;

  /** The Stack name, which defaults to the plan file's own name. */
  readonly stackName?: SimCloudFormationStackName | string | undefined;

  /**
   * What the Resources of the plan run.
   *
   * A plan points a function at a zip on disk, an S3 object or a container
   * image, and none of the three is a handler Yulin can run. A binding
   * matching on the function name the plan carries is how a simulated function
   * gets its behaviour.
   */
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;

  /**
   * The values the plan could not carry.
   *
   * Terraform resolves nothing inside a value it could not build, so a Lambda
   * `environment.variables` map holding one reference to a queue of the same
   * plan arrives without its variable names, and an `aws_iam_role_policy`
   * document built with `jsonencode` arrives without its statements. An
   * override supplies one of those against the name the plan carries, and is
   * used only where the plan resolved nothing.
   *
   * What no override covers is named on the report's `lost`.
   */
  readonly overrides?: readonly TerraformPlanOverride[] | undefined;
}

/** What one plan deployed as, and what reading the plan made of it. */
export interface TerraformPlanDeployment {
  readonly stack: SimCfnDeployedStack;

  /**
   * What happened to every resource of the plan.
   *
   * The Stack holds the resources this had a mapping for. The rest of the plan
   * is here, by Terraform address and type, with the reason each was left out.
   */
  readonly report: TerraformImportReport;
}

/**
 * Deploys Terraform into simulated AWS.
 *
 * A team whose infrastructure is written in Terraform reaches simulated AWS
 * through this rather than by hand-writing a second CloudFormation template
 * describing the same infrastructure.
 *
 * Underneath, a plan becomes a CloudFormation template body and goes through
 * the same Stack machinery a synthesized template goes through. That is an
 * implementation detail of this adapter. Simulated CloudFormation knows
 * nothing about Terraform, and a Stack deployed from a plan is an ordinary
 * Stack.
 */
export class TerraformAdapter {
  private readonly simAws: SimAws;

  constructor(simAws: SimAws) {
    this.simAws = simAws;
  }

  /**
   * Deploy the resources of a Terraform plan into simulated AWS.
   *
   * The file is the JSON `terraform show -json <planfile>` writes, rather than
   * the saved plan file itself. A path on its own is the same deployment as an
   * object naming only the path.
   *
   * A resource type this has no mapping for, and a resource from a provider
   * other than AWS, are recorded on the report rather than failing the
   * deployment.
   */
  async deployPlan(
    properties: TerraformPlanDeployProperties | string,
  ): Promise<TerraformPlanDeployment> {
    const deployment =
      typeof properties === "string" ? { planPath: properties } : properties;
    const { planPath, bindings, overrides } = deployment;

    const { template, report } = cfnTemplateFromTerraformPlan(
      await readTerraformPlanFile(planPath),
      overrides,
    );

    const stack = await this.simAws.cloudFormation().deployTemplate({
      stackName:
        deployment.stackName ?? terraformStackNameFromPlanPath(planPath),
      template,
      bindings,
    });

    return { stack, report };
  }
}
