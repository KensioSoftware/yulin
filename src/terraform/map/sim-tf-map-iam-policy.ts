import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  attribute,
  field,
  templateValue,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import { terraformReferencedResource } from "../sim-tf-referenced.js";

/**
 * An inline policy on the role it is attached to.
 *
 * A document built with `jsonencode` around an ARN of the same plan is unknown
 * in its entirety, and its statements are gone with it, so a deployment can
 * supply the document against the role's own name.
 *
 * With nothing supplied, the role is created holding a policy that allows
 * everything and the attribute is recorded as lost. Simulated IAM evaluates
 * authorization, so the alternative is a role that denies what the
 * configuration allowed, which fails the resources that use it and takes the
 * rest of the Stack with them. A role that is too permissive is the same
 * answer sim CloudFormation gives a Resource type it cannot create: carry on,
 * and say what was stepped over.
 */
export function inlinePolicy(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const document = policyDocument(context) ?? unknownPolicyDocument;

  return {
    Policies: [{ PolicyName: policyName(context), PolicyDocument: document }],
  };
}

/** The attributes this fold could not carry, which is the document or none. */
export function inlinePolicyLost(
  context: TerraformMappingContext,
): readonly string[] {
  return policyDocument(context) === undefined ? ["policy"] : [];
}

/**
 * What this policy allows, from the plan or from the deployment.
 *
 * The plan comes first, so a supplied document fills a gap rather than
 * replacing a document Terraform resolved.
 */
function policyDocument(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  return (
    jsonDocument(field(context.resource.values, "policy")) ??
    suppliedDocument(context)
  );
}

/**
 * The document a deployment supplied for the role this policy is attached to.
 *
 * The `role` attribute holds a reference rather than a name, because a role
 * created by the same plan has no ID until it exists. The role behind the
 * reference is what carries the name an override is matched on.
 */
function suppliedDocument(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const role = terraformReferencedResource(
    context.resource,
    "role",
    context.resolver,
  );

  return templateValue(
    context.overrides.policy(role && field(role.values, "name")),
  );
}

/** What a role whose policy the plan collapsed is allowed to do. */
const unknownPolicyDocument: SimCfnTemplateValue = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
};

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
export function jsonDocument(value: unknown): SimCfnTemplateValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed: unknown = JSON.parse(value);

  return isRecord(parsed) ? templateValue(parsed) : undefined;
}
