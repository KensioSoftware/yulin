import { SimSesError } from "../error/sim-ses.error.js";

/**
 * Build the error a Resource of a simulated SES type is refused with.
 *
 * The wording is deliberate. Sim CloudFormation reads an error saying a
 * Resource is unsupported as one to record and step over, and stepping over an
 * identity or a template that cannot be created as the template asked for it
 * is the wrong answer: the Stack would look deployed while every send from it
 * failed. So a refusal here says the Resource is invalid.
 */
export function simCfnSesResourceError(
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
 * Run the simulated SES commands one Resource is made of, naming the Resource
 * in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary SES commands, so what a
 * template may ask for is decided once, by simulated SES, rather than again in
 * the CloudFormation layer. What that leaves out is where the request came
 * from: a deployment failing with `Only Handlebars substitution is simulated`
 * says nothing about which Resource asked for it. Only SES's own errors are
 * renamed, so a refusal the CloudFormation layer decided keeps the wording it
 * was written with.
 */
export async function simCfnSesResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimSesError) {
      throw simCfnSesResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
