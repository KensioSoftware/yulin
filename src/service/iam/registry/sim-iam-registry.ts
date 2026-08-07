import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIam } from "../sim-iam.js";
import type { SimIamAccountResolver } from "./sim-iam-account-resolver.js";

/**
 * Simulation-wide registry of account-scoped IAM facades.
 *
 * One registry belongs to one SimAws environment. It allows cross-account
 * services to resolve IAM state owned by a particular Account.
 *
 * The registry indexes IAM facades but does not create or own them.
 */
export class SimIamRegistry implements SimIamAccountResolver {
  private readonly iamByAccountId = new Map<SimAwsAccountId, SimIam>();

  /**
   * Register the IAM facade belonging to an Account.
   *
   * Re-registering the same facade is harmless. Registering a different facade
   * for an Account that already has one fails rather than silently replacing
   * account-owned IAM state.
   */
  register(accountId: SimAwsAccountId, iam: SimIam): void {
    const existingIam = this.iamByAccountId.get(accountId);

    if (existingIam === iam) {
      return;
    }

    if (existingIam !== undefined) {
      throw new Error(
        `A different SimIam is already registered for Account ${accountId}`,
      );
    }

    this.iamByAccountId.set(accountId, iam);
  }

  /**
   * Resolve the registered IAM facade belonging to an Account.
   *
   * Throws a diagnostic error when no IAM facade is registered so callers can
   * rely on receiving a usable account-scoped service.
   */
  iamForAccount(accountId: SimAwsAccountId): SimIam {
    const iam = this.findIamForAccount(accountId);

    assertDefined(iam, `Sim IAM is not registered for Account ${accountId}`);

    return iam;
  }

  /**
   * Find the registered IAM facade belonging to an Account, if there is one.
   */
  findIamForAccount(accountId: SimAwsAccountId): SimIam | undefined {
    return this.iamByAccountId.get(accountId);
  }
}
