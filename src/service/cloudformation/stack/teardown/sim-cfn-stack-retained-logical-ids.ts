import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnStackResourceLookup } from "../resource-map/sim-cfn-stack-resource-lookup.js";

interface SimCfnStackRetainedLogicalIdsProperties {
  readonly stackName: string;
  readonly resources: ReadonlyMap<string, SimCfnResource>;

  /** The identifiers DeleteStack named in RetainResources. */
  readonly retainResources?: readonly string[] | undefined;
}

/**
 * The logical IDs a DeleteStack call asked to keep, resolved against the Stack.
 *
 * An identifier the Stack has no Resource for is refused rather than ignored,
 * as CloudFormation refuses one: a caller who misspells the Resource they meant
 * to keep would otherwise watch it go. CDK construct IDs resolve here too, the
 * same way `getResource(...)` accepts them, so a test written against a
 * synthesized template need not carry the hashed logical ID.
 */
export function simCfnStackRetainedLogicalIds(
  properties: SimCfnStackRetainedLogicalIdsProperties,
): ReadonlySet<string> {
  const { stackName, resources, retainResources = [] } = properties;
  const lookup = new SimCfnStackResourceLookup(resources);
  const retained = new Set<string>();
  const missing: string[] = [];

  for (const identifier of retainResources) {
    const resource = lookup.find(identifier);

    if (resource === undefined) {
      missing.push(identifier);
    } else {
      retained.add(resource.logicalId);
    }
  }

  if (missing.length > 0) {
    throw new SimCloudFormationValidationError(
      `Invalid RetainResources: [${missing.join(", ")}] not found in Stack ${stackName}`,
    );
  }

  return retained;
}
