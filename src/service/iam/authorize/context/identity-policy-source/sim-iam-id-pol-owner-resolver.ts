import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";

/**
 * An IAM entity that can own identity-based policies.
 *
 * Roles and users expose the same policy storage properties, so callers can
 * process a resolved owner without branching on the principal type.
 */
export type SimIamIdentityPolicyOwner = SimIamRole | SimIamUser;

interface SimIamIdentityPolicyOwnerResolverProperties {
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
}

/**
 * Resolves an authenticated principal ARN to the IAM entity whose identity
 * policies apply to that principal.
 *
 * Authorization requests contain a principal ARN, while IAM stores roles and
 * users in maps keyed by their names. This resolver owns the conversion between
 * those representations. Keeping that lookup separate allows policy-source
 * construction to work with a resolved owner instead of knowing how each
 * principal type is stored.
 *
 * Temporary assumed-role credentials supply the underlying role ARN as their
 * identity-policy principal before reaching this resolver. As a result, this
 * class only needs to match IAM role and user ARNs; it does not parse STS
 * assumed-role ARNs or inspect session state.
 */
export class SimIamIdentityPolicyOwnerResolver {
  private readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  private readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;

  constructor(properties: SimIamIdentityPolicyOwnerResolverProperties) {
    this.roles = properties.roles;
    this.users = properties.users;
  }

  /**
   * Find the role or user whose ARN exactly matches the supplied principal ARN.
   *
   * An absent ARN represents a caller without an IAM identity, such as an
   * anonymous or service principal. Such callers have no role or user identity
   * policies, so resolution returns undefined.
   *
   * Exact ARN comparison also preserves account isolation: an entity with the
   * same name in another account has a different ARN and cannot be selected.
   */
  resolve(
    principalArn: string | undefined,
  ): SimIamIdentityPolicyOwner | undefined {
    if (principalArn === undefined) {
      return undefined;
    }

    return this.role(principalArn) ?? this.user(principalArn);
  }

  /**
   * Search account-scoped role state for the matching principal ARN.
   */
  private role(principalArn: string): SimIamRole | undefined {
    return this.roles.values().find((role) => role.arn === principalArn);
  }

  /**
   * Search account-scoped user state for the matching principal ARN.
   */
  private user(principalArn: string): SimIamUser | undefined {
    return this.users.values().find((user) => user.arn === principalArn);
  }
}
