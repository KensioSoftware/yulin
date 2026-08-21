import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import { renamed, type TerraformMappingContext } from "../sim-tf-attributes.js";
import type {
  TerraformMappedResource,
  TerraformResourceFold,
} from "../sim-tf-mapping.type.js";

/** A secret. Its value arrives as an aws_secretsmanager_secret_version. */
export function secretsManagerSecret(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::SecretsManager::Secret",
    Properties: renamed(context, { Name: "name", Description: "description" }),
  };
}

/**
 * The secret value, which Terraform keeps in a resource of its own.
 *
 * CloudFormation carries the value on the `AWS::SecretsManager::Secret`, and
 * simulated Secrets Manager refuses a Secret with no value at all.
 */
export const secretsManagerFolds: ReadonlyMap<string, TerraformResourceFold> =
  new Map([
    [
      "aws_secretsmanager_secret_version",
      {
        parentAttribute: "secret_id",
        properties: (context): Record<string, SimCfnTemplateValue> =>
          renamed(context, { SecretString: "secret_string" }),
      },
    ],
  ]);
