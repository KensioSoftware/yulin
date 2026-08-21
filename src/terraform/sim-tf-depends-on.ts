import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { terraformExpressionReferences } from "./sim-tf-expression-references.js";

/**
 * The Resources one Resource has to be created after.
 *
 * A CloudFormation template orders itself, because a property that needs
 * another Resource holds a `Ref` or an `Fn::GetAtt` naming it. A plan holds no
 * such thing. Terraform resolves what it can before writing the plan, so a
 * Lambda permission naming a function it creates in the same plan carries the
 * function's name as a plain string, and the edge that ordering depends on is
 * gone from the value.
 *
 * The edge survives in `configuration`, which records every reference the
 * resource declares whether or not the value was resolved. Turning those back
 * into `DependsOn` gives the Stack the graph it would have read off a template
 * written by hand.
 */
export function terraformDependsOn(
  resource: TerraformResource,
  resolver: TerraformReferenceResolver,
): { DependsOn?: string[] } {
  const own = resolver.logicalId(resource.address);

  const referenced = [
    ...resource.dependsOn,
    ...terraformExpressionReferences(resource.expressions),
  ]
    .map((reference) => resolver.targetAddress(reference, resource))
    .filter((address): address is string => address !== undefined)
    .map((address) => resolver.logicalId(address))
    .filter((logicalId) => logicalId !== own);

  const declared = [...new Set(referenced)];

  return declared.length === 0 ? {} : { DependsOn: declared };
}
