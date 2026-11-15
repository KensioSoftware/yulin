import type { SimIamConditionValue } from "../policy/sim-iam-policy.js";

/**
 * The condition key carrying the client address a request came from.
 */
export const simAwsSourceIpConditionKey = "aws:SourceIp";

/**
 * The `aws:SourceIp` entry of a condition context, for a request that has a
 * client address.
 *
 * A request served over HTTP always has one, from `x-sim-aws-source-ip` or the
 * loopback address. An in-process SDK call has none, and leaves the key out.
 * An `IpAddress` condition on it then fails to match, as it would for a
 * request AWS receives through a VPC endpoint, and a `Null` condition matches.
 */
export function simAwsSourceIpCondition(
  sourceIp: string | undefined,
): Readonly<Record<string, SimIamConditionValue>> {
  return sourceIp === undefined
    ? {}
    : { [simAwsSourceIpConditionKey]: sourceIp };
}
