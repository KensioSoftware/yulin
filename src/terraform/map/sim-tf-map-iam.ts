/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  attribute,
  field,
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import {
  inlinePolicy,
  inlinePolicyLost,
  jsonDocument,
} from "./sim-tf-map-iam-policy.js";
import type {
  TerraformMappedResource,
  TerraformResourceFold,
} from "../sim-tf-mapping.type.js";

/** A role. The policies on it arrive as resources of their own. */
export function iamRole(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const assume = jsonDocument(
    field(context.resource.values, "assume_role_policy"),
  );

  return {
    Type: "AWS::IAM::Role",
    Properties: {
      ...renamed(context, { RoleName: "name" }),
      ...properties({
        AssumeRolePolicyDocument: assume,
        Tags: tags(context),
      }),
    },
    lost: assume === undefined ? ["assume_role_policy"] : [],
  };
}

/** The IAM resources that attach policy to a role declared elsewhere. */
export const iamRoleFolds: ReadonlyMap<string, TerraformResourceFold> = new Map<
  string,
  TerraformResourceFold
>([
  [
    "aws_iam_role_policy",
    {
      parentAttribute: "role",
      properties: inlinePolicy,
      lost: inlinePolicyLost,
    },
  ],
  [
    "aws_iam_role_policy_attachment",
    { parentAttribute: "role", properties: managedPolicy },
  ],
]);

function managedPolicy(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const arn = attribute(context, "policy_arn");

  return arn === undefined ? {} : { ManagedPolicyArns: [arn] };
}
