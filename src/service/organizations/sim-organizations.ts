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
import {
  makeSimOrganizationsPolicyId,
  type SimOrganizationsTarget,
} from "./tree/sim-organizations-node.js";

/**
 * Options for one attached service control policy.
 */
export interface SimOrganizationsAttachOptions {
  /**
   * What to call the policy in a denial. Defaults to `ServiceControlPolicy`.
   */
  readonly policyName?: string | undefined;

  /**
   * The id to attach the policy under, for taking it off again later.
   *
   * One policy attached to several nodes takes the same id at each of them.
   * Defaults to an id of this attachment's own.
   */
  readonly policyId?: string | undefined;
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
  ): string {
    const policyName = options.policyName ?? "ServiceControlPolicy";
    const policyId = options.policyId ?? makeSimOrganizationsPolicyId();

    this.scpStore.attach(this.nodeIdOf(target), policyId, document, policyName);

    return policyId;
  }

  /**
   * Take one service control policy off a node, leaving whatever else is
   * attached there.
   *
   * This is what a CloudFormation teardown uses, because a node can hold
   * policies from more than one Stack and clearing it would take another
   * Stack's guardrail away.
   */
  detachServiceControlPolicy(
    target: SimOrganizationsTarget,
    policyId: string,
  ): void {
    const nodeId = this.knownNodeIdOf(target);

    if (nodeId !== undefined) {
      this.scpStore.detach(nodeId, policyId);
    }
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
   * Only that node is cleared. An Account sitting in an organizational unit
   * goes on inheriting what the levels above it say, as it does in AWS, where
   * detaching a policy from an account leaves the account where it is. Take an
   * Account out of the organization with `removeAccount`.
   *
   * A node that has already gone leaves nothing to take off, so this does
   * nothing rather than refusing. A Stack teardown reaches that case whenever
   * a unit came down before the policy pointing at it.
   */
  detachServiceControlPolicies(target: SimOrganizationsTarget): void {
    const nodeId = this.knownNodeIdOf(target);

    if (nodeId !== undefined) {
      this.scpStore.detachAll(nodeId);
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
