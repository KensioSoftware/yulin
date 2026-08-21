import type { SimIamPolicyDocument } from "../service/iam/policy/sim-iam-policy.js";
import type {
  TerraformFunctionEnvironmentOverride,
  TerraformPlanOverride,
  TerraformRolePolicyOverride,
} from "./sim-tf-override.type.js";

/**
 * The values a deployment supplied for the gaps a plan left, by the name each
 * one is matched on.
 *
 * A mapping asks this for the name the plan gave a resource and gets back what
 * was supplied for it, or nothing. Asking with a name the plan itself could not
 * resolve gets nothing back, which is the same answer as no override, so a
 * mapping has one case to handle rather than two.
 */
export class TerraformPlanOverrides {
  private readonly environments: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  >;

  private readonly policies: ReadonlyMap<string, SimIamPolicyDocument>;

  constructor(overrides: readonly TerraformPlanOverride[] = []) {
    this.environments = new Map(
      overrides
        .filter(isEnvironmentOverride)
        .map((override) => [override.functionName, override.environment]),
    );
    this.policies = new Map(
      overrides
        .filter(isRolePolicyOverride)
        .map((override) => [override.roleName, override.policy]),
    );
  }

  /** The environment variables supplied for one function name. */
  public environment(
    functionName: unknown,
  ): Readonly<Record<string, string>> | undefined {
    return typeof functionName === "string"
      ? this.environments.get(functionName)
      : undefined;
  }

  /** The inline policy document supplied for one role name. */
  public policy(roleName: unknown): SimIamPolicyDocument | undefined {
    return typeof roleName === "string"
      ? this.policies.get(roleName)
      : undefined;
  }
}

function isEnvironmentOverride(
  override: TerraformPlanOverride,
): override is TerraformFunctionEnvironmentOverride {
  return override.functionName !== undefined;
}

function isRolePolicyOverride(
  override: TerraformPlanOverride,
): override is TerraformRolePolicyOverride {
  return override.roleName !== undefined;
}
