/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import type { TerraformExpression } from "./sim-tf-plan.type.js";
import {
  terraformAwsProvider,
  type TerraformResource,
} from "./sim-tf-resource.type.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { longestFirst } from "./sim-tf-reference-address.js";
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

    const parentId = foldTargetLogicalId(
      resource,
      fold.parentAttribute,
      resolver,
    );
    const parent = parentId === undefined ? undefined : merged.get(parentId);

    if (parentId === undefined || parent === undefined) {
      skipped.push({
        address: resource.address,
        type: resource.type,
        reason: "fold target not found",
      });
      continue;
    }

    merged.set(
      parentId,
      mergedParent(parent, fold.properties({ resource, resolver })),
    );
    folded.push({ address: resource.address, type: resource.type });
    lost.push(
      ...(fold.lost?.({ resource, resolver }) ?? []).map((attribute) => ({
        address: resource.address,
        attribute,
      })),
    );
  }

  return { templates: merged, folded, skipped, lost };
}

/**
 * The logical ID of the resource a fold belongs to.
 *
 * The fold's parent attribute holds a reference rather than a value, because a
 * bucket or a role being created by the same plan has no name until it exists.
 * The reference names the resource directly, which is what a fold needs.
 */
function foldTargetLogicalId(
  resource: TerraformResource,
  parentAttribute: string,
  resolver: TerraformReferenceResolver,
): string | undefined {
  const expression = resource.expressions[parentAttribute];

  if (!isRecord(expression)) {
    return undefined;
  }

  const references = longestFirst(
    (expression as TerraformExpression).references ?? [],
  );

  for (const reference of references) {
    const address = resolver.targetAddress(reference, resource.modulePath);

    if (address !== undefined) {
      return resolver.logicalId(address);
    }
  }

  return undefined;
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
