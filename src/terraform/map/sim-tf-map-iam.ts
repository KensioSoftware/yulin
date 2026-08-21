/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  attribute,
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
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
      lost: (context) =>
        inlineDocument(context) === undefined ? ["policy"] : [],
    },
  ],
  [
    "aws_iam_role_policy_attachment",
    { parentAttribute: "role", properties: managedPolicy },
  ],
]);

/**
 * An inline policy on the role it is attached to.
 *
 * A document built with `jsonencode` around an ARN of the same plan is unknown
 * in its entirety, and its statements are gone with it. What is left is a role
 * whose permissions this cannot know, so the role is created holding a policy
 * that allows everything and the attribute is recorded as lost.
 *
 * Simulated IAM evaluates authorization, so the alternative is a role that
 * denies what the configuration allowed, which fails the resources that use it
 * and takes the rest of the Stack with them. A role that is too permissive is
 * the same answer sim CloudFormation gives a Resource type it cannot create:
 * carry on, and say what was stepped over.
 */
function inlinePolicy(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const document = inlineDocument(context) ?? unknownPolicyDocument;

  return {
    Policies: [{ PolicyName: policyName(context), PolicyDocument: document }],
  };
}

function inlineDocument(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  return jsonDocument(field(context.resource.values, "policy"));
}

/** What a role whose policy the plan collapsed is allowed to do. */
const unknownPolicyDocument: SimCfnTemplateValue = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
};

function managedPolicy(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const arn = attribute(context, "policy_arn");

  return arn === undefined ? {} : { ManagedPolicyArns: [arn] };
}

/** The name of an inline role policy, which Terraform lets go unnamed. */
function policyName(context: TerraformMappingContext): string {
  const name = attribute(context, "name");

  return typeof name === "string" && name.length > 0 ? name : "inline";
}

/**
 * A policy document, which Terraform carries as a JSON string and
 * CloudFormation as an object.
 *
 * A document built with `jsonencode` around an ARN of the same plan is unknown
 * in its entirety, so this returns nothing rather than a partial policy.
 */
function jsonDocument(value: unknown): SimCfnTemplateValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed: unknown = JSON.parse(value);

  return isRecord(parsed) ? templateValue(parsed) : undefined;
}
