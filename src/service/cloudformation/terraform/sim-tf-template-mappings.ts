/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { terraformLogicalId } from "./sim-tf-reference.js";
import { skip } from "./sim-tf-template-merge.js";
import { dependsOn } from "./sim-tf-template-graph.js";
import {
  terraformResourceFolds,
  terraformResourceMappings,
} from "./sim-tf-registry.js";
import type {
  TerraformImportedResource,
  TerraformLostAttribute,
  TerraformSkippedResource,
} from "./sim-tf-report.type.js";

const awsProvider = "hashicorp/aws";

export interface TerraformMappingPass {
  readonly resources: readonly TerraformResource[];
  readonly resolver: TerraformReferenceResolver;
  readonly templates: Map<string, SimCfnTemplateValueRecord>;
  readonly claimedBy: Map<string, string>;
  readonly mapped: TerraformImportedResource[];
  readonly skipped: TerraformSkippedResource[];
  readonly lost: TerraformLostAttribute[];
}

/**
 * Turn every resource that has a mapping into a CloudFormation Resource.
 *
 * A resource from another provider, one whose type has no mapping, and one
 * whose target service requires a property the plan could not resolve are all
 * recorded and stepped over, so a plan Yulin only partly understands still
 * deploys the part it does.
 */
export function applyMappings(pass: TerraformMappingPass): void {
  for (const resource of pass.resources) {
    mapOne(resource, pass);
  }
}

function mapOne(resource: TerraformResource, pass: TerraformMappingPass): void {
  if (resource.provider !== awsProvider) {
    pass.skipped.push(skip(resource, "not an AWS provider resource"));
    return;
  }

  const mapping = terraformResourceMappings.get(resource.type);

  if (mapping === undefined) {
    if (!terraformResourceFolds.has(resource.type)) {
      pass.skipped.push(skip(resource, "no mapping for resource type"));
    }
    return;
  }

  const built = mapping({ resource, resolver: pass.resolver });
  const missing = (built.requires ?? []).filter(
    (name) => built.Properties[name] === undefined,
  );

  if (missing.length > 0) {
    pass.skipped.push(skip(resource, "unresolved required attribute"));
    pass.lost.push(
      ...missing.map((name) => ({
        address: resource.address,
        attribute: name,
      })),
    );
    return;
  }

  declare(resource, built.Type, built.Properties, pass);

  pass.lost.push(
    ...(built.lost ?? []).map((attribute) => ({
      address: resource.address,
      attribute,
    })),
  );
}

/**
 * Put one Resource in the template under the logical ID its address gives.
 *
 * Two addresses reaching one logical ID is refused rather than resolved, since
 * the alternative is one Resource silently standing for two.
 */
function declare(
  resource: TerraformResource,
  type: string,
  resourceProperties: Record<string, unknown>,
  pass: TerraformMappingPass,
): void {
  const logicalId = terraformLogicalId(resource.address);
  const claimed = pass.claimedBy.get(logicalId);

  if (claimed !== undefined) {
    throw new Error(
      `Terraform addresses ${claimed} and ${resource.address} both give the ` +
        `CloudFormation logical ID ${logicalId}`,
    );
  }

  pass.claimedBy.set(logicalId, resource.address);
  pass.templates.set(logicalId, {
    Type: type,
    Properties: resourceProperties as SimCfnTemplateValueRecord,
    ...dependsOn(resource, pass.resolver),
  });
  pass.mapped.push({
    address: resource.address,
    type: resource.type,
    cfnType: type,
  });
}
