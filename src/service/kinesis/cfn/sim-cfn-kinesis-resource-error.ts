import { SimKinesisError } from "../error/sim-kinesis.error.js";

/**
 * Build the error a Resource of a simulated Kinesis type is refused with.
 *
 * The wording is deliberate. Sim CloudFormation reads an error saying a
 * Resource is unsupported as one to record and step over, and stepping over a
 * stream that cannot be created as the template asked for it is the wrong
 * answer: the Stack would look deployed while nothing could be put anywhere. So
 * a refusal here says the Resource is invalid.
 */
export function simCfnKinesisResourceError(
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
 * Run the simulated Kinesis commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary Kinesis commands, so what
 * a template may ask for is decided once, by simulated Kinesis, rather than
 * again in the CloudFormation layer. What that leaves out is where the request
 * came from: a deployment failing with `ShardCount 0 is not a whole number of
 * shards` says nothing about which Resource asked for it. Only Kinesis's own
 * errors are renamed, so a refusal the CloudFormation layer decided keeps the
 * wording it was written with.
 */
export async function simCfnKinesisResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimKinesisError) {
      throw simCfnKinesisResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
