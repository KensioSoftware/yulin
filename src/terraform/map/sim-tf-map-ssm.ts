import { renamed, type TerraformMappingContext } from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/** A parameter. */
export function ssmParameter(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::SSM::Parameter",
    Properties: renamed(context, {
      Name: "name",
      Type: "type",
      Value: "value",
      Description: "description",
    }),
  };
}
