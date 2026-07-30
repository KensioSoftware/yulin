import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimSqsInvalidParameterValue,
  SimSqsMessageNotInflight,
} from "../../error/sim-sqs.error.js";
import type { SimSqsQueueAccess } from "../queue/sim-sqs-queue-access.js";
import { SimSqsMessageHandles } from "./sim-sqs-message-handles.js";
import type {
  SimChangeMessageVisibilityCommand,
  SimChangeMessageVisibilityCommandOutput,
} from "./consume.command.js";

const maximumVisibilityTimeoutSeconds = 43_200;

interface SimSqsChangeMessageVisibilityProperties {
  readonly access: SimSqsQueueAccess;
  readonly clock: BackgroundScheduler;
}

interface SimSqsChangeMessageVisibilityOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The ChangeMessageVisibility command.
 *
 * The new timeout runs from now rather than from when the message was received,
 * as it does on real SQS, so a consumer part way through a slow handler asks for
 * the time it still needs. A timeout of zero gives the message straight back to
 * the queue.
 */
export class SimSqsChangeMessageVisibility {
  private readonly access: SimSqsQueueAccess;
  private readonly clock: BackgroundScheduler;
  private readonly handles: SimSqsMessageHandles;

  constructor(properties: SimSqsChangeMessageVisibilityProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
    this.handles = new SimSqsMessageHandles({ clock: properties.clock });
  }

  /**
   * Change how much longer a received message stays hidden.
   */
  handle(
    command: SimChangeMessageVisibilityCommand,
    options?: SimSqsChangeMessageVisibilityOptions,
  ): SimChangeMessageVisibilityCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:ChangeMessageVisibility",
      command.input.QueueUrl,
      options?.caller,
    );
    const timeout = visibilityTimeout(command.input.VisibilityTimeout);
    const changedAt = this.clock.now();
    const message = this.handles.message(
      queue,
      SimSqsMessageHandles.required(command.input.ReceiptHandle),
    );

    if (!message.isInFlightAt(changedAt)) {
      throw new SimSqsMessageNotInflight(
        "The message referred to isn't in flight: its visibility timeout has " +
          "already lapsed, so there is none left to change",
      );
    }

    message.hideFor(changedAt, timeout);

    return { $metadata: {} };
  }
}

/**
 * How long a message is hidden for by a visibility change.
 */
function visibilityTimeout(requested: number | undefined): number {
  if (
    requested === undefined ||
    !Number.isSafeInteger(requested) ||
    requested < 0 ||
    requested > maximumVisibilityTimeoutSeconds
  ) {
    throw new SimSqsInvalidParameterValue(
      `Value ${String(requested)} for parameter VisibilityTimeout is ` +
        `invalid. Reason: Must be an integer from 0 to ` +
        `${String(maximumVisibilityTimeoutSeconds)}.`,
    );
  }

  return requested;
}
