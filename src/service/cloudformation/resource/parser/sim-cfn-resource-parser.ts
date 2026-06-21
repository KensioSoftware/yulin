import type { SimCloudFormationParsedResourceType } from "../factory/sim-cfn-resource-factory.type.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Parse a sim CloudFormation Resource type label like AWS::S3::Bucket or
 * Custom::CDKBucketDeployment to extract the provider, service, and resource type
 * names.
 */
export function parseSimCloudFormationResourceType(
  resourceType: string,
): SimCloudFormationParsedResourceType {
  const parts = resourceType.split("::");

  if (parts.length === 2) {
    const [providerName, resourceTypeName] = parts;

    assertDefined(
      providerName,
      `CloudFormation provider name in ${resourceType}`,
    );
    assertDefined(
      resourceTypeName,
      `CloudFormation resource type name in ${resourceType}`,
    );

    if (
      providerName !== "Custom" ||
      providerName.length === 0 ||
      resourceTypeName.length === 0
    ) {
      throw new Error(
        `Invalid sim CloudFormation Resource type ${resourceType}`,
      );
    }

    return {
      providerName,
      serviceName: "Custom",
      resourceTypeName,
    };
  }

  if (parts.length !== 3) {
    throw new Error(`Invalid sim CloudFormation Resource type ${resourceType}`);
  }

  const [providerName, serviceName, resourceTypeName] = parts;
  assertDefined(
    providerName,
    `CloudFormation provider name in ${resourceType}`,
  );
  assertDefined(serviceName, `CloudFormation service name in ${resourceType}`);
  assertDefined(
    resourceTypeName,
    `CloudFormation resource type name in ${resourceType}`,
  );

  if (
    providerName.length === 0 ||
    serviceName.length === 0 ||
    resourceTypeName.length === 0
  ) {
    throw new Error(`Invalid sim CloudFormation Resource type ${resourceType}`);
  }

  return {
    providerName,
    serviceName,
    resourceTypeName,
  };
}
