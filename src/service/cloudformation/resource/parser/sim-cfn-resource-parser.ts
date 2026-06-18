import type { SimCloudFormationParsedResourceType } from "../factory/sim-cfn-resource-factory.type.js";

/**
 * Parse a sim CloudFormation Resource type label like AWS::S3::Bucket to
 * extract the service and resource type names.
 */
export function parseSimCloudFormationResourceType(
  resourceType: string,
): SimCloudFormationParsedResourceType {
export function parseSimCloudFormationResourceType(
  resourceType: string,
): SimCloudFormationParsedResourceType {
  const parts = resourceType.split("::");
  if (parts.length !== 3) {
    throw new Error(`Invalid sim CloudFormation Resource type ${resourceType}`);
  }

  const [providerName, serviceName, resourceTypeName] = parts;

  if (
    providerName.length === 0 ||
    serviceName.length === 0 ||
    resourceTypeName.length === 0
  ) {
    throw new Error(`Invalid sim CloudFormation Resource type ${resourceType}`);
  }
}

  return {
    providerName,
    serviceName,
    resourceTypeName,
  };
}
