import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamPolicy } from "../../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type { SimIamAuthZPolicySource } from "../sim-iam-auth-z-context.js";
import { SimIamIdentityPolicyOwnerResolver } from "./sim-iam-id-pol-owner-resolver.js";
import { SimIamIdentityPolicyOwnerSourceBuilder } from "./sim-iam-id-pol-owner-source-builder.js";

interface SimIamAuthZIdentityPolicySourceBuilderProperties {
  policies?: ReadonlyMap<SimArn, SimIamPolicy>;
  roles?: ReadonlyMap<SimIamRoleName, SimIamRole>;
  users?: ReadonlyMap<SimIamUsername, SimIamUser>;
}

/**
 * Coordinates identity-policy discovery for an authorization request.
 *
 * Principal lookup and policy conversion use separate collaborators because
 * they operate on different representations:
 *
 * - the owner resolver maps a principal ARN to an account-scoped role or user;
 * - the owner source builder converts that entity's stored policies into
 *   authorization sources.
 *
 * This class defines the workflow between those operations and handles callers
 * that have no matching IAM policy owner.
 */
export class SimIamAuthZIdentityPolicyCoordinator {
  private readonly ownerResolver: SimIamIdentityPolicyOwnerResolver;
  private readonly ownerSourceBuilder: SimIamIdentityPolicyOwnerSourceBuilder;

  constructor(properties: SimIamAuthZIdentityPolicySourceBuilderProperties) {
    const {
      policies = new Map(),
      roles = new Map(),
      users = new Map(),
    } = properties;

    this.ownerResolver = new SimIamIdentityPolicyOwnerResolver({
      roles,
      users,
    });
    this.ownerSourceBuilder = new SimIamIdentityPolicyOwnerSourceBuilder({
      policies,
    });
  }

  /**
   * Return identity-policy sources belonging to the principal ARN.
   *
   * Anonymous callers, service principals, and unknown IAM ARNs have no
   * matching role or user. Those callers contribute no identity policies,
   * though resource policies may still affect authorization.
   */
  build(principalArn: string | undefined): readonly SimIamAuthZPolicySource[] {
    const owner = this.ownerResolver.resolve(principalArn);

    return owner === undefined ? [] : this.ownerSourceBuilder.build(owner);
  }
}
