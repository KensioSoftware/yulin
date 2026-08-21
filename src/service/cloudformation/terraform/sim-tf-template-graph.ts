/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { TerraformExpression } from "./sim-tf-plan.type.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import {
  type TerraformReferenceResolver,
  terraformLogicalId,
} from "./sim-tf-reference.js";
import { longestFirst } from "./sim-tf-reference-address.js";

/**
 * The logical ID of the resource a fold belongs to.
 *
 * The fold's parent attribute holds a reference rather than a value, because a
 * bucket or a role being created by the same plan has no name until it exists.
 * The reference names the resource directly, which is what a fold needs.
 */
export function foldTargetLogicalId(
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
      return terraformLogicalId(address);
    }
  }

  return undefined;
}

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
export function dependsOn(
  resource: TerraformResource,
  resolver: TerraformReferenceResolver,
): { DependsOn?: string[] } {
  const own = terraformLogicalId(resource.address);

  const referenced = [
    ...resource.dependsOn,
    ...expressionReferences(resource.expressions),
  ]
    .map((reference) => resolver.targetAddress(reference, resource.modulePath))
    .filter((address): address is string => address !== undefined)
    .map((address) => terraformLogicalId(address))
    .filter((logicalId) => logicalId !== own);

  const declared = [...new Set(referenced)];

  return declared.length === 0 ? {} : { DependsOn: declared };
}

/** Every `references` entry anywhere inside a resource's expressions. */
function expressionReferences(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => expressionReferences(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    key === "references" && Array.isArray(nested)
      ? nested.filter((entry): entry is string => typeof entry === "string")
      : expressionReferences(nested),
  );
}
