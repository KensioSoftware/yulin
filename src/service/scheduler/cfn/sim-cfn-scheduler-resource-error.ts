import { SimSchedulerError } from "../error/sim-scheduler.error.js";

/**
 * The CloudFormation Resource type simulated Scheduler creates.
 */
export const schedulerScheduleResourceType = "AWS::Scheduler::Schedule";

/**
 * Build the error a Resource of a simulated Scheduler type is refused with.
 *
 * Sim CloudFormation reads an error saying a Resource is unsupported as one to
 * record and step over, and stepping over a schedule that cannot be created as
 * the template asked for it is the wrong answer: the Stack would look deployed
 * while nothing ever fired. So a refusal here says the Resource is invalid.
 */
export function simCfnSchedulerResourceError(
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(
    `Invalid ${schedulerScheduleResourceType} Resource ${logicalId}: ${reason}`,
    { cause },
  );
}

/**
 * Run the simulated Scheduler commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource here goes through the ordinary Scheduler commands, so what a
 * template may ask for is decided once, by simulated Scheduler, rather than
 * again in the CloudFormation layer. Only Scheduler's own errors are renamed,
 * so a refusal the CloudFormation layer decided keeps its own wording.
 */
export async function simCfnSchedulerResourceCreation<T>(
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimSchedulerError) {
      throw simCfnSchedulerResourceError(logicalId, error.message, error);
    }

    throw error;
  }
}
