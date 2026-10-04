import type { SimWafUnsimulatedPart } from "../resource/sim-waf-unsimulated-part.js";
import type { SimWafBodyInspectionResourceType } from "./sim-waf-association-config.js";

/**
 * The resource types a simulated request reaches a web ACL through.
 */
const simulatedResourceTypes: ReadonlySet<string> =
  new Set<SimWafBodyInspectionResourceType>([
    "CLOUDFRONT",
    "API_GATEWAY",
    "COGNITO_USER_POOL",
  ]);

/**
 * What the body inspection limits a web ACL sets leave out, one part per
 * resource type no simulated request passes through.
 */
export function unsimulatedSimWafBodyLimits(
  resourceTypes: Iterable<string>,
): readonly SimWafUnsimulatedPart[] {
  return [...resourceTypes]
    .filter((resourceType) => !simulatedResourceTypes.has(resourceType))
    .map((resourceType) => ({
      part: `AssociationConfig.RequestBody.${resourceType}`,
      reason:
        `AssociationConfig sets the body inspection limit for ` +
        `${resourceType} resources, and ` +
        `${[...simulatedResourceTypes].join(" and ")} are the types a ` +
        `simulated request reaches a web ACL through`,
    }));
}
