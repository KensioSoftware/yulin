/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { TerraformPlan } from "./sim-tf-plan.type.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";
import { mappableResolver } from "./sim-tf-template-resolver.js";
import { applyMappings } from "./sim-tf-template-mappings.js";
import { recordPrunedResources } from "./sim-tf-template-pruned.js";
import { applyFolds } from "./sim-tf-template-folds.js";
import type {
  TerraformImportReport,
  TerraformImportedResource,
  TerraformLostAttribute,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

export interface TerraformImportResult {
  readonly template: CfnTemplateBodyRecord;
  readonly report: TerraformImportReport;
}

/**
 * A CloudFormation template body built from a Terraform plan.
 *
 * The plan is the JSON `terraform show -json` writes for a saved plan file.
 * What comes back is the body `deployTemplate` takes, so everything downstream
 * of the template is the machinery a CloudFormation or SAM deployment already
 * goes through.
 *
 * The report alongside it says what happened to every resource of the plan. A
 * type with no mapping is skipped and named, in the same spirit as the skipped
 * Resources a Stack records for a CloudFormation type no simulated service
 * models.
 *
 * This is spike code, kept so the measurement behind it stays reproducible.
 * The README beside it says what is known to need work before this is a
 * feature, and nothing here is exported from the package.
 */
export function cfnTemplateFromTerraformPlan(
  plan: TerraformPlan,
): TerraformImportResult {
  const resources = terraformPlanResources(plan);

  const resolver = mappableResolver(plan, resources);

  const mapped: TerraformImportedResource[] = [];
  const folded: TerraformImportedResource[] = [];
  const skipped: TerraformSkippedResource[] = [];
  const lost: TerraformLostAttribute[] = [];
  const templates = new Map<string, SimCfnTemplateValueRecord>();
  const claimedBy = new Map<string, string>();

  applyMappings({
    resources,
    resolver,
    templates,
    claimedBy,
    mapped,
    skipped,
    lost,
  });

  applyFolds({ resources, resolver, templates, folded, skipped });

  recordPrunedResources({ templates, claimedBy, mapped, skipped });

  return {
    template: { Resources: Object.fromEntries(templates) },
    report: {
      total: resources.length,
      mapped,
      folded,
      skipped,
      lost,
    },
  };
}
