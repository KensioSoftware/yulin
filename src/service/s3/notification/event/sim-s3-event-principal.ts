import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";

/**
 * The principal an event says caused it.
 *
 * Real S3 puts the unique id of the IAM entity here, the `AIDA...` or
 * `AROA...` form. Simulated IAM has no unique-id namespace: it carries ARNs,
 * which is also what a test would assert on. The ARN goes in rather than an
 * invented AIDA-shaped string, and the divergence is recorded in the usage
 * docs. `src/serve/payload-2/sim-payload-2-event.type.ts` does the same thing
 * for the same reason.
 */
export function simS3EventPrincipalId(caller: SimAwsResolvedCaller): string {
  if (caller.arn !== undefined) {
    return caller.arn;
  }

  if (caller.service !== undefined) {
    return caller.service;
  }

  return "anonymous";
}
