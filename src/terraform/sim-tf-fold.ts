/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  terraformAwsProvider,
  type TerraformResource,
} from "./sim-tf-resource.type.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { terraformReferencedAddress } from "./sim-tf-referenced.js";
import type { TerraformPlanOverrides } from "./sim-tf-overrides.js";
import { terraformResourceFolds } from "./sim-tf-registry.js";
import type {
  TerraformImportedResource,
  TerraformLostAttribute,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

/** The template with every folding resource merged into what it configures. */
export interface TerraformFoldedResources {
  readonly templates: ReadonlyMap<string, SimCfnTemplateValueRecord>;
  readonly folded: readonly TerraformImportedResource[];
  readonly skipped: readonly TerraformSkippedResource[];
  readonly lost: readonly TerraformLostAttribute[];
}

/**
 * Merge every folding resource into the Resource it configures.
 *
 * The AWS provider splits one CloudFormation Resource across several Terraform
 * resources. Six `aws_s3_bucket_*` resources configure one bucket, and
 * CloudFormation carries all six as properties of one `AWS::S3::Bucket`.
 *
 * This runs after the Resources are declared, because a fold has nothing to
 * merge into until its parent is in the template. A fold whose parent is not
 * there is recorded rather than dropped, so the report still adds up to the
 * plan.
 */
export function terraformFoldedResources(
  resources: readonly TerraformResource[],
  templates: ReadonlyMap<string, SimCfnTemplateValueRecord>,
  resolver: TerraformReferenceResolver,
  overrides: TerraformPlanOverrides,
): TerraformFoldedResources {
  const merged = new Map(templates);
  const folded: TerraformImportedResource[] = [];
  const skipped: TerraformSkippedResource[] = [];
  const lost: TerraformLostAttribute[] = [];

  for (const resource of resources) {
    const fold = terraformResourceFolds.get(resource.type);

    if (fold === undefined || resource.provider !== terraformAwsProvider) {
      continue;
    }

    const address = terraformReferencedAddress(
      resource,
      fold.parentAttribute,
      resolver,
    );
    const parentId =
      address === undefined ? undefined : resolver.logicalId(address);
    const parent = parentId === undefined ? undefined : merged.get(parentId);

    if (parentId === undefined || parent === undefined) {
      skipped.push({
        address: resource.address,
        type: resource.type,
        reason: "fold target not found",
      });
      continue;
    }

    const context = { resource, resolver, overrides };

    merged.set(parentId, mergedParent(parent, fold.properties(context)));
    folded.push({ address: resource.address, type: resource.type });
    lost.push(
      ...(fold.lost?.(context) ?? []).map((attribute) => ({
        address: resource.address,
        attribute,
      })),
    );
  }

  return { templates: merged, folded, skipped, lost };
}

/**
 * A resource template with a fold's properties merged into it.
 *
 * The fold contributes whole CloudFormation properties, so a later fold on the
 * same parent replaces a property an earlier one set rather than merging into
 * it. No two folds of one resource type write the same property.
 */
function mergedParent(
  parent: SimCfnTemplateValueRecord,
  added: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const existing = parent["Properties"];

  return {
    ...parent,
    Properties: { ...(isRecord(existing) && existing), ...added },
  };
}
