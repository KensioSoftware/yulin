import {
  simAwsAccountId,
  type SimAwsAccountId,
} from "../aws/sim-aws-account.js";
import type { SimIamPolicyDocument } from "../iam/policy/sim-iam-policy.js";
import type {
  SimIamServiceControlPolicy,
  SimIamServiceControlPolicyResolver,
  SimIamServiceControlPolicySet,
} from "../iam/authorize/scp/sim-iam-scp-resolver.js";
import { SimOrganizationsStructure } from "./sim-organizations-structure.js";
import type { SimOrganizationsTarget } from "./tree/sim-organizations-node.js";

/**
 * Options for one attached service control policy.
 */
export interface SimOrganizationsAttachOptions {
  /**
   * What to call the policy in a denial. Defaults to `ServiceControlPolicy`.
   */
  readonly policyName?: string | undefined;
}

/**
 * Simulated AWS Organizations, holding the organization structure and the
 * service control policies that decide what its Accounts may do.
 *
 * An organization spans Accounts, so one of these belongs to a SimAws rather
 * than to an Account scope, and it is reached as `simAws.organizations()`.
 *
 * A service control policy filters permissions and grants none. Every level
 * between the root and an Account has to allow an action for the Account to be
 * allowed it, and a Deny at any level ends the request whatever else allows
 * it. That applies to the Account root as well as to its Roles and Users, so
 * it catches a CloudFormation deployment and an intercepted SDK call alike.
 *
 * The root, the organizational units and where the Accounts sit come from
 * SimOrganizationsStructure, which this extends.
 */
export class SimOrganizations
  extends SimOrganizationsStructure
  implements SimIamServiceControlPolicyResolver
{
  /**
   * Attach a service control policy to the root, an organizational unit, or an
   * Account.
   *
   * The node also holds AWS's own FullAWSAccess policy, as it would in a real
   * organization, so one Deny statement denies that action and leaves the rest
   * of the node's Accounts working.
   */
  attachServiceControlPolicy(
    target: SimOrganizationsTarget,
    document: SimIamPolicyDocument,
    options: SimOrganizationsAttachOptions = {},
  ): void {
    const policyName = options.policyName ?? "ServiceControlPolicy";

    this.scpStore.attach(this.nodeIdOf(target), document, policyName);
  }

  /**
   * Take AWS's FullAWSAccess policy off a node, leaving only the policies
   * attached to it to allow anything through that level.
   *
   * This turns the node into an allow list. An action no policy attached there
   * allows is denied for every Account beneath it.
   */
  detachFullAwsAccess(target: SimOrganizationsTarget): void {
    this.scpStore.detachFullAwsAccess(this.nodeIdOf(target));
  }

  /**
   * Remove every service control policy attached to a node.
   *
   * An Account is then decided by its identity and resource policies alone,
   * along with whatever the levels above it still say.
   */
  detachServiceControlPolicies(target: SimOrganizationsTarget): void {
    this.scpStore.detachAll(this.nodeIdOf(target));

    if (typeof target === "string") {
      this.removeAccount(simAwsAccountId(target));
    }
  }

  /**
   * The service control policies in force for an Account, root level first.
   *
   * This flattens the levels, so it says what was evaluated without saying
   * which level each policy came from. `serviceControlPolicySetFor` keeps that
   * apart, and a denial needs it, because a level allowing nothing denies the
   * Account whatever another level allows.
   */
  serviceControlPoliciesFor(
    accountId: SimAwsAccountId | string,
  ): readonly SimIamServiceControlPolicy[] {
    const set = this.serviceControlPolicySetFor(accountId);

    return set.levels.flatMap((level) => level.policies);
  }

  /**
   * The policies in force for an Account, level by level, along with whether
   * the Account is inside this organization at all.
   *
   * Sim IAM reads this rather than the flattened list, because each level has
   * to allow an action on its own.
   */
  serviceControlPolicySetFor(
    accountId: SimAwsAccountId | string,
  ): SimIamServiceControlPolicySet {
    return this.effectivePolicies.setFor(simAwsAccountId(accountId));
  }
}
