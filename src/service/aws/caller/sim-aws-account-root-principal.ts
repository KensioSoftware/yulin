import type { SimAwsAccountId } from "../sim-aws-account.js";
import type { SimAwsPrincipal } from "./sim-aws-caller.js";

/**
 * Make the intrinsic root principal for a simulated AWS Account.
 */
export function makeSimAwsAccountRootPrincipal(
  accountId: SimAwsAccountId,
): SimAwsPrincipal {
  return {
    arn: `arn:aws:iam::${accountId}:root`,
    accountId,
    principalType: "root",
    name: "root",
  };
}
