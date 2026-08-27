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
import { SimOrganizationsScpStore } from "./policy/sim-organizations-scp-store.js";

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
 * Simulated AWS Organizations, holding the service control policies that
 * decide what the Accounts in this simulation may do.
 *
 * An organization spans Accounts, so one of these belongs to a SimAws rather
 * than to an Account scope, and it is reached as `simAws.organizations()`.
 *
 * A service control policy filters permissions and grants none. An Account
 * with policies attached needs an Allow among them for an action, on top of
 * whatever its identity and resource policies say, and a Deny among them ends
 * the request whatever else allows it. That applies to the Account root as
 * well as to its Roles and Users, so it catches a CloudFormation deployment
 * and an intercepted SDK call alike.
 */
export class SimOrganizations implements SimIamServiceControlPolicyResolver {
  private readonly scpStore = new SimOrganizationsScpStore();

  /**
   * Attach a service control policy to a simulated Account.
   *
   * The Account also gets AWS's own FullAWSAccess policy, as it would in a
   * real organization, so one Deny statement denies that action and leaves the
   * rest of the Account working.
   */
  attachServiceControlPolicy(
    accountId: string,
    document: SimIamPolicyDocument,
    options: SimOrganizationsAttachOptions = {},
  ): void {
    this.scpStore.attach(
      simAwsAccountId(accountId),
      document,
      options.policyName ?? "ServiceControlPolicy",
    );
  }

  /**
   * Take AWS's FullAWSAccess policy off an Account, leaving only the policies
   * attached to it to allow anything.
   *
   * This turns the Account's service control policies into an allow list. An
   * action no attached policy allows is denied.
   */
  detachFullAwsAccess(accountId: string): void {
    this.scpStore.detachFullAwsAccess(simAwsAccountId(accountId));
  }

  /**
   * Remove every service control policy from an Account.
   *
   * The Account is then decided by its identity and resource policies alone,
   * as it was before anything was attached.
   */
  detachServiceControlPolicies(accountId: string): void {
    this.scpStore.detachAll(simAwsAccountId(accountId));
  }

  /**
   * The service control policies in force for an Account.
   *
   * This is what sim IAM evaluates, in the order it evaluates them, so a test
   * tracking down a denial can read the same list the decision did. An empty
   * list means either that the Account is outside the organization or that
   * every policy has been taken off it, which
   * `serviceControlPolicySetFor(...).applies` tells apart.
   */
  serviceControlPoliciesFor(
    accountId: SimAwsAccountId | string,
  ): readonly SimIamServiceControlPolicy[] {
    return this.serviceControlPolicySetFor(simAwsAccountId(accountId)).policies;
  }

  /**
   * The policies in force for an Account, along with whether the Account is
   * inside this organization at all.
   *
   * Sim IAM reads this rather than the list, because an Account left holding
   * no policies is denied everything while an Account outside the organization
   * is unrestricted.
   */
  serviceControlPolicySetFor(
    accountId: SimAwsAccountId | string,
  ): SimIamServiceControlPolicySet {
    return this.scpStore.policySetFor(simAwsAccountId(accountId));
  }
}
