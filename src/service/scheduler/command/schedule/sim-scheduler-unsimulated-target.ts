import { SimSchedulerUnsimulatedInputException } from "../../error/sim-scheduler.error.js";
import type { SimSchedulerRequestTarget } from "./schedule.command.js";

/**
 * The target properties this simulation does not model, and what each would
 * have done.
 *
 * Each is refused rather than dropped, because a schedule dropping one looks
 * configured to whoever wrote it and unconfigured to everything else: a dead
 * letter queue that is never written to is worse than one that was refused.
 */
function unsimulatedTargetProperties(
  target: SimSchedulerRequestTarget,
): readonly (readonly [string, unknown, string])[] {
  return [
    [
      "EventBridgeParameters",
      target.EventBridgeParameters,
      "an event bus is not a simulated target",
    ],
    [
      "KinesisParameters",
      target.KinesisParameters,
      "Kinesis is not a simulated target",
    ],
    [
      "SageMakerPipelineParameters",
      target.SageMakerPipelineParameters,
      "SageMaker is not a simulated target",
    ],
    [
      "SqsParameters",
      target.SqsParameters,
      "a FIFO queue target is not simulated",
    ],
  ];
}

/**
 * Refuse the target properties this simulation does not model.
 */
export function refuseUnsimulatedTarget(
  target: SimSchedulerRequestTarget | undefined,
): void {
  if (target === undefined) {
    return;
  }

  for (const [property, value, reason] of unsimulatedTargetProperties(target)) {
    if (value !== undefined) {
      throw new SimSchedulerUnsimulatedInputException(
        `Target ${property} is not simulated, so a schedule carrying one is ` +
          `refused rather than created with it dropped: ${reason}.`,
      );
    }
  }
}
