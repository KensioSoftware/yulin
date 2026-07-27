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

  /**
   * Find simulated IAM for an Account, without requiring it to exist.
   *
   * An Account with no IAM registered is a legitimate answer rather than a
   * fault: a request can name a principal in an Account the simulation was
   * never told about, and that Account grants it nothing.
   */
  findIamForAccount(accountId: SimAwsAccountId): SimIam | undefined;
}
