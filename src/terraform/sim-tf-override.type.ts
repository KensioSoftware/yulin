import type { SimIamPolicyDocument } from "../service/iam/policy/sim-iam-policy.js";

/**
 * A value a deployment supplies because the plan could not carry it.
 *
 * Terraform resolves nothing inside a value it could not build, so an
 * attribute holding one reference to a resource of the same plan arrives
 * unknown along with everything around it. A Lambda `environment.variables`
 * map loses its variable names, and an `aws_iam_role_policy` document built
 * with `jsonencode` loses its statements.
 *
 * An override is matched the way a deploy binding is, on the name the plan
 * carries. It fills a gap and never replaces what the plan resolved, so a
 * configuration that later resolves the value on its own stops needing one.
 */
export type TerraformPlanOverride =
  | TerraformFunctionEnvironmentOverride
  | TerraformRolePolicyOverride;

/** The environment variables of the function the plan names. */
export interface TerraformFunctionEnvironmentOverride {
  readonly functionName: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly roleName?: never;
  readonly policy?: never;
}

/**
 * The inline policy of the role the plan names.
 *
 * The name is the role's own `name`, which is what a plan resolves for a role
 * declared with one, rather than the name of the `aws_iam_role_policy`
 * resource holding the document.
 */
export interface TerraformRolePolicyOverride {
  readonly roleName: string;
  readonly policy: SimIamPolicyDocument;
  readonly functionName?: never;
  readonly environment?: never;
}
