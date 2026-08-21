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
import {
  TerraformReferenceResolver,
  terraformLogicalId,
} from "./sim-tf-reference.js";
import { dependsOn } from "./sim-tf-template-graph.js";
import { skip } from "./sim-tf-template-merge.js";
import { terraformResourceMappings } from "./sim-tf-registry.js";
import { applyFolds } from "./sim-tf-template-folds.js";
import { terraformResourceFolds } from "./sim-tf-registry.js";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";
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

const awsProvider = "hashicorp/aws";

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
 */
export function cfnTemplateFromTerraformPlan(
  plan: TerraformPlan,
): TerraformImportResult {
  const resources = terraformPlanResources(plan);

  /*
   * References are resolved only against resources that become a
   * CloudFormation Resource of their own. A reference to a type with no
   * mapping would otherwise produce an intrinsic naming a logical ID the
   * template never declares, and the property carrying it would reach the
   * service factory as an object where it wanted a string.
   */
  const resolver = new TerraformReferenceResolver(
    resources.filter(
      (resource) =>
        resource.provider === awsProvider &&
        terraformResourceMappings.has(resource.type),
    ),
    terraformModuleOutputs(plan),
  );

  const mapped: TerraformImportedResource[] = [];
  const folded: TerraformImportedResource[] = [];
  const skipped: TerraformSkippedResource[] = [];
  const lost: TerraformLostAttribute[] = [];
  const templates = new Map<string, SimCfnTemplateValueRecord>();

  for (const resource of resources) {
    if (resource.provider !== awsProvider) {
      skipped.push(skip(resource, "not an AWS provider resource"));
      continue;
    }

    const mapping = terraformResourceMappings.get(resource.type);

    if (mapping === undefined) {
      if (!terraformResourceFolds.has(resource.type)) {
        skipped.push(skip(resource, "no mapping for resource type"));
      }
      continue;
    }

    const built = mapping({ resource, resolver });
    const missing = (built.requires ?? []).filter(
      (name) => built.Properties[name] === undefined,
    );

    if (missing.length > 0) {
      skipped.push(skip(resource, "unresolved required attribute"));
      lost.push(
        ...missing.map((name) => ({
          address: resource.address,
          attribute: name,
        })),
      );
      continue;
    }

    templates.set(terraformLogicalId(resource.address), {
      Type: built.Type,
      Properties: built.Properties,
      ...dependsOn(resource, resolver),
    });

    mapped.push({
      address: resource.address,
      type: resource.type,
      cfnType: built.Type,
    });

    const lostAttributes = built.lost ?? [];

    for (const attribute of lostAttributes) {
      lost.push({ address: resource.address, attribute });
    }
  }

  applyFolds({ resources, resolver, templates, folded, skipped });

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
