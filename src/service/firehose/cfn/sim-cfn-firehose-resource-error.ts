import {
  SimFirehoseError,
  SimFirehoseUnsimulatedDestination,
  SimFirehoseUnsimulatedSource,
} from "../error/sim-firehose.error.js";
import { firehoseDeliveryStreamResourceType } from "./sim-cfn-firehose-resource-types.js";

/**
 * Build the error a Resource of a simulated Firehose type is refused with.
 *
 * The wording is deliberate. Sim CloudFormation reads an error saying a
 * Resource is unsupported as one to record and step over, and stepping over a
 * delivery stream that cannot be created as the template asked for it is the
 * wrong answer where the template asked for something Firehose itself would
 * refuse: the Stack would look deployed while nothing could be put anywhere. So
 * a refusal here says the Resource is invalid.
 */
export function simCfnFirehoseResourceError(
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
 * Build the error a Resource outside the simulation is skipped with.
 *
 * The "Unsupported sim ... CloudFormation" wording is what marks the Resource
 * as skipped rather than failing the Stack, so the rest of the template still
 * deploys around it.
 */
export function simCfnFirehoseUnsupportedResourceError(
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(
    `Unsupported sim Firehose CloudFormation Resource ${logicalId}: ${reason}`,
    { cause },
  );
}

/**
 * Run the simulated Firehose commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary Firehose commands, so what
 * a template may ask for is decided once, by simulated Firehose, rather than
 * again in the CloudFormation layer. What that leaves out is where the request
 * came from: a deployment failing with `DeliveryStreamName order/events may
 * hold only letters` says nothing about which Resource asked for it.
 *
 * The two refusals naming something outside the simulation are turned into
 * skips instead. A delivery stream writing to Redshift or reading a Kinesis
 * stream is a delivery stream this simulator has no behaviour for, and dropping
 * it is the smallest thing that can be dropped: the Stack still deploys, and
 * `stack.skippedResources` says what is missing. Only Firehose's own errors are
 * touched, so a refusal the CloudFormation layer decided keeps the wording it
 * was written with.
 */
export async function simCfnFirehoseResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (isUnsimulatedFirehoseFeature(error)) {
      throw simCfnFirehoseUnsupportedResourceError(
        logicalId,
        error.message,
        error,
      );
    }

    if (error instanceof SimFirehoseError) {
      throw simCfnFirehoseResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}

/**
 * Whether a refusal says the delivery stream is outside the simulation, rather
 * than that the template got it wrong.
 */
function isUnsimulatedFirehoseFeature(error: unknown): error is Error {
  return (
    error instanceof SimFirehoseUnsimulatedDestination ||
    error instanceof SimFirehoseUnsimulatedSource
  );
}

/**
 * Build the error one AWS::KinesisFirehose::DeliveryStream Resource's
 * properties are refused with.
 */
export function simCfnFirehoseDeliveryStreamPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return simCfnFirehoseResourceError(
    firehoseDeliveryStreamResourceType,
    logicalId,
    reason,
  );
}
