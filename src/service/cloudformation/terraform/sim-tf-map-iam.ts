/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  attribute,
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type {
  TerraformMappedResource,
  TerraformResourceFold,
} from "./sim-tf-mapping.type.js";

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

/** A log group. Terraform spells "never expire" as a retention of zero. */
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

/** The IAM resources that attach policy to a role declared elsewhere. */
export const iamRoleFolds: ReadonlyMap<string, TerraformResourceFold> = new Map(
  [
    [
      "aws_iam_role_policy",
      { parentAttribute: "role", properties: inlinePolicy },
    ],
    [
      "aws_iam_role_policy_attachment",
      { parentAttribute: "role", properties: managedPolicy },
    ],
  ],
);

function inlinePolicy(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const document = jsonDocument(field(context.resource.values, "policy"));

  if (document === undefined) {
    return {};
  }

  return {
    Policies: [{ PolicyName: policyName(context), PolicyDocument: document }],
  };
}

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
