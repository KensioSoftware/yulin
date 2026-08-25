import { SimAthenaError } from "../error/sim-athena.error.js";

/**
 * A refusal naming the Resource that could not be created.
 *
 * Sim CloudFormation reads an error saying a Resource is unsupported as one to
 * record and step over. Stepping over a workgroup the template asked for is
 * the wrong answer, because the Stack would look deployed while the guardrail
 * it exists to set was never configured. So a refusal here says the Resource
 * is invalid, which fails it.
 */
export function simCfnAthenaResourceError(
  resourceTypeName: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(
    `Invalid ${resourceTypeName} Resource ${logicalId}: ${reason}`,
    { cause },
  );
}

/**
 * Run the simulated Athena commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource here goes through the ordinary Athena commands, so what a
 * template may ask for is decided once, by simulated Athena, rather than again
 * in the CloudFormation layer. Only Athena's own errors are renamed, so a
 * refusal the CloudFormation layer decided keeps its own wording.
 */
export async function simCfnAthenaResourceCreation<T>(
  resourceTypeName: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimAthenaError) {
      throw simCfnAthenaResourceError(
        resourceTypeName,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
