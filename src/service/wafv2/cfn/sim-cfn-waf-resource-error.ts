import {
  SimWafError,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";

/**
 * Build the error a Resource of a simulated WAFv2 type is refused with.
 *
 * Sim CloudFormation fails a stack on this one, so it is kept for a Resource
 * nothing coherent could be deployed from: a `Rules` property that is not a
 * list, a scope outside `REGIONAL` and `CLOUDFRONT`, an association naming no
 * resource. Something WAFv2 cannot evaluate is a different thing and takes the
 * skip below.
 */
export function simCfnWafResourceError(
  resourceType: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(`Invalid ${resourceType} Resource ${logicalId}: ${reason}`, {
    cause,
  });
}

/**
 * Build the error a Resource carrying something WAFv2 cannot evaluate is
 * skipped with.
 *
 * The "Unsupported sim ... CloudFormation" wording is what sim CloudFormation
 * reads as a Resource to record and step over, so the Resource lands on
 * `stack.skippedResources` carrying the reason WAFv2 gave, and the rest of the
 * template deploys.
 *
 * Skipping keeps the caution the refusal was written with. A web ACL that
 * accepted a rule it cannot evaluate would allow a request AWS blocks, and a
 * web ACL that is missing allows exactly as much as a stack that never
 * deployed. What it drops is the blast radius: a user pool, a table, a secret
 * and two functions in the same template are no business of one rule.
 */
export function simCfnWafSkippedResourceError(
  resourceType: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(
    `Unsupported sim WAFv2 CloudFormation ${resourceType} Resource ` +
      `${logicalId}: ${reason}`,
    { cause },
  );
}

/**
 * Run the simulated WAFv2 commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary WAFv2 commands, so what a
 * template may ask for is decided once, by simulated WAFv2, rather than again
 * in the CloudFormation layer. What that leaves out is where the request came
 * from: a deployment failing with `Rule block-admin uses the statement kind
 * SqliMatchStatement` says which rule but not which Resource declared it, and
 * a template can hold several. Only WAFv2's own errors are renamed, so a
 * refusal the CloudFormation layer decided keeps the wording it was written
 * with.
 *
 * The two kinds of refusal part company here. Input WAFv2 will not take is a
 * failed Resource, and input it takes and this simulation cannot evaluate is a
 * skipped one.
 */
export async function simCfnWafResourceCommand<T>(
  resourceType: string,
  logicalId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SimWafUnsimulatedInputException) {
      throw simCfnWafSkippedResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    if (error instanceof SimWafError) {
      throw simCfnWafResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
