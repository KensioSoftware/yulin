import {
  SimSchedulerError,
  SimSchedulerResourceNotFoundException,
} from "../error/sim-scheduler.error.js";

/**
 * The CloudFormation Resource types simulated Scheduler creates.
 */
export const schedulerScheduleResourceType = "AWS::Scheduler::Schedule";

export const schedulerScheduleGroupResourceType =
  "AWS::Scheduler::ScheduleGroup";

/**
 * Build the error a Resource of a simulated Scheduler type is refused with.
 *
 * Sim CloudFormation reads an error saying a Resource is unsupported as one to
 * record and step over, and stepping over a schedule that cannot be created as
 * the template asked for it is the wrong answer: the Stack would look deployed
 * while nothing ever fired. So a refusal here says the Resource is invalid.
 */
export function simCfnSchedulerResourceError(
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
 * Run the simulated Scheduler commands one Resource is made of, naming the
 * Resource in whatever they refuse.
 *
 * Every Resource here goes through the ordinary Scheduler commands, so what a
 * template may ask for is decided once, by simulated Scheduler, rather than
 * again in the CloudFormation layer. Only Scheduler's own errors are renamed,
 * so a refusal the CloudFormation layer decided keeps its own wording.
 */
export async function simCfnSchedulerResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimSchedulerError) {
      throw simCfnSchedulerResourceError(
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
 * Remove the resource one Resource created, leaving one that has already gone.
 *
 * Real CloudFormation treats deleting a Resource that has already gone as
 * done rather than as a failure, and a Scheduler teardown reaches that case. A
 * schedule group takes its schedules with it. A schedule whose template named
 * its group as a string rather than by `Ref` declares no dependency on it, and
 * may find itself already deleted by the time its own turn comes.
 */
export async function simCfnSchedulerResourceDeletion(
  remove: () => Promise<void>,
): Promise<void> {
  try {
    await remove();
  } catch (error) {
    if (!(error instanceof SimSchedulerResourceNotFoundException)) {
      throw error;
    }
  }
}
