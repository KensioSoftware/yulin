import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { parseSimCfnNode } from "../../template/parse/sim-cfn-node-parser.js";

/**
 * Return CloudFormation Resource logical IDs from a DependsOn template value.
 */
export function parseSimCfnResourceDependencies(dependsOn: unknown): string[] {
  if (typeof dependsOn === "string") {
    return [dependsOn];
  }

  if (Array.isArray(dependsOn)) {
    return dependsOn.filter((dependency): dependency is string => {
      return typeof dependency === "string";
    });
  }

  return [];
}

/**
 * Return implicit dependency logical IDs created by Ref expressions inside a
 * Resource template.
 *
 * Only names that match a known Resource logical ID become dependencies. Refs to
 * Parameters or pseudo-parameters do not create Resource ordering constraints.
 */
export function parseSimCfnResourceRefDependencies(
  template: SimCfnTemplateValueRecord,
  resourceLogicalIds: ReadonlySet<string>,
): string[] {
  const referencedNames = parseSimCfnNode(template).referencedNames();

  return [...new Set(referencedNames)].filter((name) =>
    resourceLogicalIds.has(name),
  );
}
