import {
  attribute,
  renamed,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A parameter.
 *
 * Terraform stores a `SecureString` through Parameter Store's own encryption.
 * CloudFormation has no way to declare one, since the plaintext value would
 * sit in the template, and refuses the type. Such a parameter is left out and
 * recorded rather than deployed into a failure that would take the rest of the
 * Stack with it.
 */
export function ssmParameter(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const secure = attribute(context, "type") === "SecureString";

  return {
    Type: "AWS::SSM::Parameter",
    Properties: renamed(context, {
      Name: "name",
      Type: "type",
      Value: "value",
      Description: "description",
    }),
    ...(secure && { refused: "a property value the service refuses" }),
  };
}
