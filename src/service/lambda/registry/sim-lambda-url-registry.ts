import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import {
  makeSimLambdaFunctionUrlId,
  type SimLambdaFunctionUrlId,
} from "../function/url/sim-lambda-function-url.js";

/**
 * Simulated Lambda cross-Account registry of Function URL ids.
 *
 * A served Function URL request carries its region in the hostname, but not
 * the Account. Simulated Lambda state is per Account/Region, so the serving
 * layer needs a way to get from a URL id to the Account that owns it. This
 * registry is that lookup, which is why URL ids are allocated here and are
 * unique across every Account and Region of one simulated AWS environment.
 */
export class SimLambdaUrlRegistry {
  private readonly functionUrlAccountIds = new Map<
    SimLambdaFunctionUrlId,
    SimAwsAccountId
  >();

  /**
   * Allocate a Function URL id that is unique in this simulated AWS.
   */
  allocateFunctionUrlId(): SimLambdaFunctionUrlId {
    let urlId = makeSimLambdaFunctionUrlId();

    while (this.functionUrlAccountIds.has(urlId)) {
      /* v8 ignore next -- does not happen in practice */
      urlId = makeSimLambdaFunctionUrlId();
    }

    return urlId;
  }

  /**
   * Register a Function URL id to the Account that owns it.
   */
  registerFunctionUrl(
    urlId: SimLambdaFunctionUrlId,
    accountId: SimAwsAccountId,
  ): void {
    this.functionUrlAccountIds.set(urlId, accountId);
  }

  /**
   * Forget a Function URL id, so its hostname stops resolving.
   */
  deregisterFunctionUrl(urlId: SimLambdaFunctionUrlId): void {
    this.functionUrlAccountIds.delete(urlId);
  }

  /**
   * Get the Account that owns a Function URL id, if it is registered.
   */
  accountIdForFunctionUrl(
    urlId: SimLambdaFunctionUrlId,
  ): SimAwsAccountId | undefined {
    return this.functionUrlAccountIds.get(urlId);
  }
}
