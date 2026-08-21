import {
  attribute,
  properties,
  renamed,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A log group.
 *
 * Terraform spells "never expire" as a retention of zero, and simulated
 * CloudWatch Logs refuses a `RetentionInDays` of zero the way real
 * CloudFormation does. A group configured to keep its logs forever is one
 * declaring no retention at all.
 */
export function logGroup(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const retention = attribute(context, "retention_in_days");

  return {
    Type: "AWS::Logs::LogGroup",
    Properties: {
      ...renamed(context, { LogGroupName: "name" }),
      ...properties({
        RetentionInDays: retention === 0 ? undefined : retention,
      }),
    },
  };
}
