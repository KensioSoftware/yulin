import { CffUint8ArrayStowaway } from "../../cff/function-code-input/cff-function-code-input.js";
import { SimCloudFrontFunctionSizeLimitExceeded } from "../../error/sim-cloudfront.error.js";
import type { SimCreateFunctionCommandInput } from "./create-function.command.js";

/**
 * The most Function source CloudFront takes.
 *
 * The quota is published as 10 KB and is not adjustable. AWS never says which
 * byte count that means. 10,240 is the looser of the two readings, and it keeps
 * the simulator from refusing a Function real CloudFront would take.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-functions
 */
export const maxCffCodeBytes = 10_240;

/**
 * Refuse Function source over the CloudFront size limit.
 *
 * The limit is on the source as uploaded, comments and all, and nothing
 * minifies it on the way to CloudFront. A consumer who goes over otherwise
 * finds out at deploy time, after the whole test suite has already passed.
 *
 * A stowaway carries a handler reference in place of source. It has no bytes to
 * measure and goes unchecked.
 */
export function assertCffCodeWithinSizeLimit(
  functionName: string,
  functionCode: SimCreateFunctionCommandInput["FunctionCode"],
): void {
  if (functionCode instanceof CffUint8ArrayStowaway) {
    return;
  }

  const byteLength = functionCode?.byteLength ?? 0;

  if (byteLength > maxCffCodeBytes) {
    throw new SimCloudFrontFunctionSizeLimitExceeded(
      `CloudFront Function ${functionName} code is ${String(byteLength)} ` +
        `bytes, over the ${String(maxCffCodeBytes)} CloudFront takes`,
    );
  }
}
