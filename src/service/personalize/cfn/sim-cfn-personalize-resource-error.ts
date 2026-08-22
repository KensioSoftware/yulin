import { SimPersonalizeError } from "../error/sim-personalize.error.js";

/**
 * Build the error a Resource of a simulated Personalize type is refused with.
 *
 * The wording matters. Sim CloudFormation reads an error saying a Resource is
 * unsupported as one to record and step over, and stepping over a dataset group
 * or a solution that could not be created would leave the Stack looking
 * deployed while every ARN pointing into it named nothing. So a refusal here
 * says the Resource is invalid.
 */
export function simCfnPersonalizeResourceError(
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
 * Run the simulated Personalize commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary Personalize commands, so
 * what a template may ask for is decided once by simulated Personalize rather
 * than again in the CloudFormation layer. What that leaves out is where the
 * request came from. A deployment failing with `A dataset group needs a name`
 * says nothing about which Resource asked for it. Only Personalize's own errors
 * are renamed, so a refusal the CloudFormation layer decided keeps the wording
 * it was written with.
 */
export async function simCfnPersonalizeResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimPersonalizeError) {
      throw simCfnPersonalizeResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
