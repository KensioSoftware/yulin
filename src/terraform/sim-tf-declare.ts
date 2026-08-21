/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import { terraformDependsOn } from "./sim-tf-depends-on.js";
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
