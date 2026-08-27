import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import type { SimIamServiceControlPolicy } from "../../iam/authorize/scp/sim-iam-scp-resolver.js";

/**
 * The AWS-managed policy attached to every organization node by default.
 *
 * Turning service control policies on in an organization leaves every
 * account's permissions as they were, because this policy comes with them. A
 * simulated Account gets the same treatment, so attaching one Deny statement
 * denies that one action and leaves the rest of the Account working.
 */
export const SIM_ORGANIZATIONS_FULL_AWS_ACCESS: SimIamServiceControlPolicy = {
  policyName: "FullAWSAccess",
  document: {
    Version: "2012-10-17",
    Statement: { Effect: "Allow", Action: "*", Resource: "*" },
  },
};

interface SimOrganizationsAccountPolicies {
  readonly attached: SimIamServiceControlPolicy[];
  fullAwsAccess: boolean;
}

/**
 * The service control policies attached to each simulated Account.
 *
 * An Account absent from the store is outside the organization's reach and is
 * decided by IAM alone. An Account present in it carries FullAWSAccess along
 * with whatever was attached, until a test detaches FullAWSAccess to write an
 * allow list instead of a deny list.
 */
export class SimOrganizationsScpStore {
  private readonly byAccountId = new Map<
    SimAwsAccountId,
    SimOrganizationsAccountPolicies
  >();

  /**
   * Attach a service control policy to an Account.
   */
  attach(
    accountId: SimAwsAccountId,
    document: SimIamPolicyDocument,
    policyName?: string,
  ): void {
    this.accountPolicies(accountId).attached.push({ document, policyName });
  }

  /**
   * Take the AWS-managed FullAWSAccess policy off an Account.
   *
   * What remains has to allow an action for the Account to be allowed it,
   * which is how an organization is turned into an allow list.
   */
  detachFullAwsAccess(accountId: SimAwsAccountId): void {
    this.accountPolicies(accountId).fullAwsAccess = false;
  }

  /**
   * Remove every service control policy from an Account, FullAWSAccess
   * included, putting it back outside the organization's reach.
   */
  detachAll(accountId: SimAwsAccountId): void {
    this.byAccountId.delete(accountId);
  }

  /**
   * The policies in force for an Account, FullAWSAccess first.
   */
  policiesFor(
    accountId: SimAwsAccountId,
  ): readonly SimIamServiceControlPolicy[] {
    const account = this.byAccountId.get(accountId);

    if (account === undefined) {
      return [];
    }

    return account.fullAwsAccess
      ? [SIM_ORGANIZATIONS_FULL_AWS_ACCESS, ...account.attached]
      : [...account.attached];
  }

  /**
   * The record for an Account, created on first use.
   */
  private accountPolicies(
    accountId: SimAwsAccountId,
  ): SimOrganizationsAccountPolicies {
    const existing = this.byAccountId.get(accountId);

    if (existing !== undefined) {
      return existing;
    }

    const created: SimOrganizationsAccountPolicies = {
      attached: [],
      fullAwsAccess: true,
    };

    this.byAccountId.set(accountId, created);

    return created;
  }
}
