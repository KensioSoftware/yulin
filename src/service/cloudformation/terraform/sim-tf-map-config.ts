/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import { renamed, type TerraformMappingContext } from "./sim-tf-attributes.js";
import type {
  TerraformMappedResource,
  TerraformResourceFold,
} from "./sim-tf-mapping.type.js";

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
