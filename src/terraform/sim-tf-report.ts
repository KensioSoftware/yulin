import type { TerraformResource } from "./sim-tf-resource.type.js";
import {
  terraformMissingProperties,
  type TerraformSettledPlan,
} from "./sim-tf-settle.js";
import type { TerraformDeclaredResources } from "./sim-tf-declare.js";
import type { TerraformFoldedResources } from "./sim-tf-fold.js";
import type {
  TerraformImportReport,
  TerraformLostAttribute,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

export interface TerraformImportPasses {
  readonly resources: readonly TerraformResource[];
  readonly settled: TerraformSettledPlan;
  readonly declared: TerraformDeclaredResources;
  readonly folded: TerraformFoldedResources;
}

/**
 * What an import did with every resource of the plan.
 *
 * Each resource is in exactly one of mapped, folded and skipped, so the three
 * add up to the plan's managed resource count. That is what makes the mapped
 * fraction a fraction of something, and what a reader checks the report
 * against the configuration with.
 */
export function terraformImportReport(
  passes: TerraformImportPasses,
): TerraformImportReport {
  const { resources, settled, declared, folded } = passes;

  return {
    total: resources.length,
    mapped: declared.mapped,
    folded: folded.folded,
    skipped: skippedResources(resources, settled, folded.skipped),
    lost: [
      ...declared.lost,
      ...folded.lost,
      ...refusedAttributes(resources, settled),
    ],
  };
}

/**
 * Every resource the template holds nothing for, in the plan's own order.
 *
 * A resource is refused before anything is built, or is a fold that never
 * found the resource it configures. Reading the plan's order back means the
 * report can be read beside the configuration it came from.
 */
function skippedResources(
  resources: readonly TerraformResource[],
  settled: TerraformSettledPlan,
  foldSkips: readonly TerraformSkippedResource[],
): readonly TerraformSkippedResource[] {
  const byAddress = new Map(foldSkips.map((skip) => [skip.address, skip]));

  return resources.flatMap((resource) => {
    const reason = settled.refused.get(resource.address);

    if (reason !== undefined) {
      return [{ address: resource.address, type: resource.type, reason }];
    }

    const foldSkip = byAddress.get(resource.address);

    return foldSkip === undefined ? [] : [foldSkip];
  });
}

/**
 * The attributes a refused resource was refused for.
 *
 * A resource left out because a required value would not resolve names that
 * value here, so the report says which attribute the plan could not carry
 * rather than only that the resource is missing.
 */
function refusedAttributes(
  resources: readonly TerraformResource[],
  settled: TerraformSettledPlan,
): readonly TerraformLostAttribute[] {
  return resources
    .filter((resource) => settled.refused.has(resource.address))
    .flatMap((resource) =>
      terraformMissingProperties(resource, settled.resolver).map(
        (attribute) => ({ address: resource.address, attribute }),
      ),
    );
}
