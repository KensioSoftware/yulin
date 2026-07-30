import { SimSqsInvalidParameterValue } from "../error/sim-sqs.error.js";
import type { SimSqsMessageStore } from "../message/sim-sqs-message-store.js";
import type { SimSqsQueue } from "./sim-sqs-queue.js";
import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";
import type { SimSqsQueueStore } from "./sim-sqs-queue-store.js";
import {
  type SimSqsRedrivePolicy,
  simSqsRedrivePolicyIn,
} from "./sim-sqs-redrive-policy.js";

interface SimSqsDeadLetterTargetsProperties {
  readonly queues: SimSqsQueueStore;
}

/**
 * One queue's messages at an instant, as the thing a move works on.
 */
export interface SimSqsDeadLetterMove {
  readonly policy: SimSqsRedrivePolicy | undefined;
  readonly messages: SimSqsMessageStore;
  readonly sourceQueueArn: string;
  readonly instant: Date;
}

/**
 * How a queue reaches the dead-letter queue its redrive policy names.
 *
 * The target is resolved by whole ARN rather than by the name inside one, so an
 * ARN naming another Account or Region finds nothing. Real SQS requires a
 * dead-letter queue to be in the same Account and Region as its source queue,
 * and it has to exist before a policy can name it: a policy pointing at nothing
 * would look like a working dead-letter queue and lose messages instead.
 */
export class SimSqsDeadLetterTargets {
  private readonly queues: SimSqsQueueStore;

  constructor(properties: SimSqsDeadLetterTargetsProperties) {
    this.queues = properties.queues;
  }

  /**
   * Refuse a request whose redrive policy names a queue that is not there.
   *
   * A request setting no redrive policy names no dead-letter queue, so there is
   * nothing to check.
   */
  assertRequestedTarget(requested: SimSqsQueueAttributeInput): void {
    const policy = simSqsRedrivePolicyIn(requested);

    if (policy === undefined || this.find(policy) !== undefined) {
      return;
    }

    throw new SimSqsInvalidParameterValue(
      `Value ${policy.value} for parameter RedrivePolicy is invalid. Reason: ` +
        `Dead letter target ${policy.deadLetterTargetArn} does not exist. A ` +
        `dead-letter queue has to be an existing queue in the same Account ` +
        `and Region as the queue redriving to it.`,
    );
  }

  /**
   * Move the messages a queue has given up on to its dead-letter queue.
   *
   * A queue with no redrive policy gives up on nothing. A dead-letter queue
   * deleted since the policy was set leaves the messages where they are rather
   * than losing them, which is the safer of the two ways to be wrong about a
   * queue that is no longer there.
   */
  move(request: SimSqsDeadLetterMove): void {
    const { policy, messages, sourceQueueArn, instant } = request;

    if (policy === undefined) {
      return;
    }

    const target = this.find(policy);

    if (target === undefined) {
      return;
    }

    for (const message of messages.exhausted(instant, policy.maxReceiveCount)) {
      messages.remove(message);
      target.add(message.onDeadLetterQueue(instant, sourceQueueArn));
    }
  }

  /**
   * The dead-letter queue a policy names, or undefined once it has been deleted.
   */
  private find(policy: SimSqsRedrivePolicy): SimSqsQueue | undefined {
    return this.queues.findByArn(policy.deadLetterTargetArn);
  }
}
