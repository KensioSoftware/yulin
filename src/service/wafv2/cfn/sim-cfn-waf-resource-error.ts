import { SimWafError } from "../error/sim-wafv2.error.js";

/**
 * Build the error a Resource of a simulated WAFv2 type is refused with.
 *
 * The wording is deliberate. Sim CloudFormation reads an error saying a
 * Resource is unsupported as one to record and step over, and stepping over a
 * web ACL that cannot be created as the template asked for it is the wrong
 * answer: the stack would look deployed while every request the rules were
 * written to stop went through. So a refusal here says the Resource is
 * invalid.
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
 */
export async function simCfnWafResourceCommand<T>(
  resourceType: string,
  logicalId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
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
