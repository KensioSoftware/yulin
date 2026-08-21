/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import { pruneDanglingReferences } from "./sim-tf-template-prune.js";
import type {
  TerraformImportedResource,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

export interface TerraformPruneBookkeeping {
  readonly templates: Map<string, SimCfnTemplateValueRecord>;
  readonly claimedBy: ReadonlyMap<string, string>;
  readonly mapped: TerraformImportedResource[];
  readonly skipped: TerraformSkippedResource[];
}

/**
 * Prune the template, and move what went from mapped to skipped.
 *
 * A Resource dropped for an unresolvable required property leaves whatever
 * referred to it naming a logical ID the template does not declare. Those go
 * here rather than reaching CloudFormation as a template it would refuse, and
 * the report follows them so the counts still add up to the plan.
 */
export function recordPrunedResources(
  bookkeeping: TerraformPruneBookkeeping,
): void {
  const { templates, claimedBy, mapped, skipped } = bookkeeping;

  for (const logicalId of pruneDanglingReferences(templates).removed) {
    const address = claimedBy.get(logicalId) ?? logicalId;
    const index = mapped.findIndex((entry) => entry.address === address);
    const [entry] = index === -1 ? [] : mapped.splice(index, 1);

    skipped.push({
      address,
      type: entry?.type ?? "unknown",
      reason: "references a resource that was skipped",
    });
  }
}
