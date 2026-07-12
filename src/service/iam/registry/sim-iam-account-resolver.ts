import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIam } from "../sim-iam.js";

/**
 * Resolves account-scoped simulated IAM facades within one simulated AWS
 * environment.
 */
export interface SimIamAccountResolver {
  /**
   * Resolve simulated IAM for an Account.
   *
   * Should throw a diagnostic error when IAM has not been instantiated and
   * registered for the requested Account.
   */
  iamForAccount(accountId: SimAwsAccountId): SimIam;
}
