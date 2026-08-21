import type { CfnTemplateBodyRecord } from "../service/cloudformation/template/sim-cfn-template.js";
import type { TerraformPlan } from "./sim-tf-plan.type.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";
import { settledTerraformPlan } from "./sim-tf-settle.js";
import { terraformDeclaredResources } from "./sim-tf-declare.js";
import { terraformFoldedResources } from "./sim-tf-fold.js";
import { terraformImportReport } from "./sim-tf-report.js";
import { TerraformPlanOverrides } from "./sim-tf-overrides.js";
import type { TerraformPlanOverride } from "./sim-tf-override.type.js";
import type { TerraformImportReport } from "./sim-tf-report.type.js";

/** A CloudFormation template built from a plan, and what building it did. */
export interface TerraformImportResult {
  readonly template: CfnTemplateBodyRecord;
  readonly report: TerraformImportReport;
}

/**
 * A CloudFormation template body built from a Terraform plan.
 *
 * The plan is the JSON `terraform show -json` writes for a saved plan file.
 * What comes back is the body `deployTemplate` takes, so everything below the
 * template is the machinery a CloudFormation, CDK or SAM deployment already
 * goes through.
 *
 * It is read in three passes. Settling decides which resources the template
 * will declare, and it is what makes the two after it single passes. Every
 * reference then resolves against a set that has stopped changing, so no
 * Resource is built and then taken back, and no property is left naming a
 * logical ID the template does not hold. Declaring builds those Resources.
 * Folding merges in the resources that configure another resource.
 *
 * The report alongside the template says what happened to every resource of
 * the plan. A type with no mapping is skipped and named, in the same spirit as
 * the skipped Resources a Stack records for a CloudFormation type no simulated
 * service models.
 */
export function cfnTemplateFromTerraformPlan(
  plan: TerraformPlan,
  supplied: readonly TerraformPlanOverride[] = [],
): TerraformImportResult {
  const overrides = new TerraformPlanOverrides(supplied);
  const resources = terraformPlanResources(plan);
  const settled = settledTerraformPlan(plan, resources, overrides);
  const declared = terraformDeclaredResources(settled);
  const folded = terraformFoldedResources(
    resources,
    declared.templates,
    settled.resolver,
    overrides,
  );

  return {
    template: { Resources: Object.fromEntries(folded.templates) },
    report: terraformImportReport({ resources, settled, declared, folded }),
  };
}
