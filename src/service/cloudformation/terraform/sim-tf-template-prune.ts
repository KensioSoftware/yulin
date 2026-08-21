/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import { referencedLogicalIds } from "./sim-tf-template-references.js";

export interface TerraformPruneResult {
  /** The logical IDs removed, in the order they were found. */
  readonly removed: readonly string[];
}

/**
 * Take out what points at a Resource the template does not declare.
 *
 * A Resource can be mapped and then dropped, because a property the service
 * requires turned out to be unresolvable. Anything that already resolved a
 * reference against it is left naming a logical ID the template never declares,
 * and CloudFormation refuses the whole template for one of those.
 *
 * The two forms are treated differently on purpose. A `DependsOn` entry is an
 * ordering hint, so a dangling one is dropped and its Resource stays. A `Ref`
 * or an `Fn::GetAtt` in a property is a value the Resource needs, so a
 * Resource holding a dangling one goes as well. That removal can strand
 * another Resource in turn, which is why this runs until nothing changes.
 */
export function pruneDanglingReferences(
  templates: Map<string, SimCfnTemplateValueRecord>,
): TerraformPruneResult {
  const removed: string[] = [];

  for (
    let stranded = strandedLogicalIds(templates);
    stranded.length > 0;
    stranded = strandedLogicalIds(templates)
  ) {
    for (const logicalId of stranded) {
      templates.delete(logicalId);
      removed.push(logicalId);
    }
  }

  for (const [logicalId, template] of templates) {
    templates.set(logicalId, withoutDanglingDependsOn(template, templates));
  }

  return { removed };
}

/** The Resources holding a property that names a Resource nothing declares. */
function strandedLogicalIds(
  templates: ReadonlyMap<string, SimCfnTemplateValueRecord>,
): readonly string[] {
  return [...templates]
    .filter(([, template]) =>
      referencedLogicalIds(
        template["Properties"] as SimCfnTemplateValueRecord,
      ).some((named) => !templates.has(named)),
    )
    .map(([logicalId]) => logicalId);
}

function withoutDanglingDependsOn(
  template: SimCfnTemplateValueRecord,
  templates: ReadonlyMap<string, SimCfnTemplateValueRecord>,
): SimCfnTemplateValueRecord {
  const declared = template["DependsOn"];

  if (!Array.isArray(declared)) {
    return template;
  }

  const kept = declared.filter(
    (entry) => typeof entry === "string" && templates.has(entry),
  );

  if (kept.length === declared.length) {
    return template;
  }

  return kept.length === 0
    ? withoutKey(template, "DependsOn")
    : { ...template, DependsOn: kept };
}

function withoutKey(
  template: SimCfnTemplateValueRecord,
  key: string,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(template).filter(([name]) => name !== key),
  );
}
