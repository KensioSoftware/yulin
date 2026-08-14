import { SimEventBridgeUnsimulatedInputException } from "../../error/sim-event-bridge.error.js";
import type { SimEventBridgeTarget } from "./target.command.js";

/**
 * One target property this simulation does not model, read straight off the
 * target rather than by key, and what refusing it should say.
 */
type SimEventBridgeTargetRefusal = readonly [
  (target: SimEventBridgeTarget) => unknown,
  string,
];

/**
 * The properties that change what a target receives, or whether it receives
 * anything at all.
 *
 * Ignoring one would leave a test believing in a transformation, a retry or a
 * dead letter queue that never happened.
 */
const behaviourRefusals: readonly SimEventBridgeTargetRefusal[] = [
  [
    (target): unknown => target.InputPath,
    "Target InputPath is not simulated, so PutTargets refuses one rather " +
      "than sending the whole event where a part of it was asked for",
  ],
  [
    (target): unknown => target.InputTransformer,
    "Target InputTransformer is not simulated, so PutTargets refuses one " +
      "rather than sending the untransformed event",
  ],
  [
    (target): unknown => target.RoleArn,
    "A target RoleArn is not simulated. A rule reaches its target as the " +
      "events.amazonaws.com service principal, which the target's own " +
      "resource policy admits.",
  ],
  [
    (target): unknown => target.DeadLetterConfig,
    "Target dead letter queues are not simulated, so PutTargets refuses a " +
      "DeadLetterConfig rather than dropping undelivered events silently",
  ],
  [
    (target): unknown => target.RetryPolicy,
    "Target retry policies are not simulated, so PutTargets refuses a " +
      "RetryPolicy rather than delivering once and calling it retried",
  ],
  [
    (target): unknown => target.SqsParameters,
    "SqsParameters names a FIFO queue's message group, and FIFO queues are " +
      "not simulated",
  ],
];

/**
 * The per-service parameters of the target types this does not deliver to.
 *
 * A target ARN naming one of these services is already refused when the target
 * is added, so these only catch a request that named the parameters without
 * the matching ARN. They share one message, since there is one reason.
 */
const unsimulatedTargetTypes: readonly (readonly [
  (target: SimEventBridgeTarget) => unknown,
  string,
])[] = [
  [(target): unknown => target.KinesisParameters, "Kinesis"],
  [(target): unknown => target.EcsParameters, "ECS"],
  [(target): unknown => target.BatchParameters, "Batch"],
  [(target): unknown => target.HttpParameters, "API destination"],
  [(target): unknown => target.RunCommandParameters, "Run Command"],
  [(target): unknown => target.RedshiftDataParameters, "Redshift Data"],
  [(target): unknown => target.SageMakerPipelineParameters, "SageMaker"],
  [(target): unknown => target.AppSyncParameters, "AppSync"],
];

/**
 * Refuse the target request inputs this simulation does not model.
 */
export function refuseUnsimulatedTargetInput(
  target: SimEventBridgeTarget,
): void {
  for (const [read, message] of behaviourRefusals) {
    if (read(target) !== undefined) {
      throw new SimEventBridgeUnsimulatedInputException(message);
    }
  }

  for (const [read, name] of unsimulatedTargetTypes) {
    if (read(target) !== undefined) {
      throw new SimEventBridgeUnsimulatedInputException(
        `${name} targets are not simulated`,
      );
    }
  }
}
