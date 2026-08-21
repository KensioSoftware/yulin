/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { terraformResourceFolds } from "./sim-tf-registry.js";
import { foldTargetLogicalId } from "./sim-tf-template-graph.js";
import { mergedParent, skip } from "./sim-tf-template-merge.js";
import type {
  TerraformImportedResource,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

export interface TerraformFoldPass {
  readonly resources: readonly TerraformResource[];
  readonly resolver: TerraformReferenceResolver;
  readonly templates: Map<string, SimCfnTemplateValueRecord>;
  readonly folded: TerraformImportedResource[];
  readonly skipped: TerraformSkippedResource[];
}

const awsProvider = "hashicorp/aws";

/**
 * Merge every folding resource into the Resource it configures.
 *
 * This runs after the mapping pass, because a fold has nothing to merge into
 * until its parent is in the template. A fold whose parent was skipped is
 * recorded rather than dropped, so the report still adds up.
 */
export function applyFolds(pass: TerraformFoldPass): void {
  for (const resource of pass.resources) {
    const fold = terraformResourceFolds.get(resource.type);

    if (fold === undefined || resource.provider !== awsProvider) {
      continue;
    }

    const parentId = foldTargetLogicalId(
      resource,
      fold.parentAttribute,
      pass.resolver,
    );
    const parent =
      parentId === undefined ? undefined : pass.templates.get(parentId);

    if (parent === undefined || parentId === undefined) {
      pass.skipped.push(skip(resource, "fold target not found"));
      continue;
    }

    pass.templates.set(
      parentId,
      mergedParent(
        parent,
        fold.properties({ resource, resolver: pass.resolver }),
      ),
    );
    pass.folded.push({ address: resource.address, type: resource.type });
  }
}
