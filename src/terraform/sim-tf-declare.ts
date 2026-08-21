/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import type { TerraformSettledPlan } from "./sim-tf-settle.js";
import type {
  TerraformImportedResource,
  TerraformLostAttribute,
} from "./sim-tf-report.type.js";

/** The Resources a settled plan declares, and what they could not carry. */
export interface TerraformDeclaredResources {
  readonly templates: ReadonlyMap<string, SimCfnTemplateValueRecord>;
  readonly mapped: readonly TerraformImportedResource[];
  readonly lost: readonly TerraformLostAttribute[];
}

/**
 * Build one CloudFormation Resource for each resource the plan settled on.
 *
 * Every reference resolves against that same settled set, so this runs once
 * and nothing it produces is taken back afterwards.
 */
export function terraformDeclaredResources(
  settled: TerraformSettledPlan,
): TerraformDeclaredResources {
  const templates = new Map<string, SimCfnTemplateValueRecord>();
  const mapped: TerraformImportedResource[] = [];
  const lost: TerraformLostAttribute[] = [];

  for (const { resource, mapping } of settled.declared) {
    const built = mapping({
      resource,
      resolver: settled.resolver,
      overrides: settled.overrides,
    });
    const logicalId = settled.resolver.logicalId(resource.address);

    templates.set(logicalId, {
      Type: built.Type,
      Properties: built.Properties,
      ...terraformDependsOn(resource, settled.resolver),
    });
    mapped.push({
      address: resource.address,
      type: resource.type,
      cfnType: built.Type,
      logicalId,
    });
    lost.push(
      ...(built.lost ?? []).map((attribute) => ({
        address: resource.address,
        attribute,
      })),
    );
  }

  return { templates, mapped, lost };
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
export function terraformDependsOn(
  resource: TerraformResource,
  resolver: TerraformReferenceResolver,
): { DependsOn?: string[] } {
  const own = resolver.logicalId(resource.address);

  const referenced = [
    ...resource.dependsOn,
    ...expressionReferences(resource.expressions),
  ]
    .map((reference) => resolver.targetAddress(reference, resource.modulePath))
    .filter((address): address is string => address !== undefined)
    .map((address) => resolver.logicalId(address))
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
