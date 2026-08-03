import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimSqsDeadLetterTargets } from "../../queue/sim-sqs-dead-letter-targets.js";
import { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import {
  type SimSqsQueueAttributeInput,
  SimSqsQueueAttributes,
} from "../../queue/sim-sqs-queue-attributes.js";
import type { SimSqsQueueActivity } from "../../queue/sim-sqs-queue-activity.js";
import { SimSqsQueueName } from "../../queue/sim-sqs-queue-name.js";
import type { SimSqsQueueStore } from "../../queue/sim-sqs-queue-store.js";
import type { SimSqsQueueAccess } from "./sim-sqs-queue-access.js";
import { refuseUnsimulatedQueueInput } from "./sim-sqs-unsimulated-queue-input.js";
import type {
  SimCreateQueueCommand,
  SimCreateQueueCommandOutput,
} from "./queue.command.js";

interface SimSqsCreateQueueProperties {
  readonly queues: SimSqsQueueStore;
  readonly access: SimSqsQueueAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
  readonly deadLetterTargets: SimSqsDeadLetterTargets;
  readonly activity: SimSqsQueueActivity;
}

/**
 * The CreateQueue command.
 *
 * Real SQS treats it as idempotent: a request for a name that is already taken
 * returns the existing queue's URL when the attributes it names match, and fails
 * when they differ. That is what makes a deployment which creates its own queue
 * safe to run twice.
 */
export class SimSqsCreateQueue {
  private readonly queues: SimSqsQueueStore;
  private readonly access: SimSqsQueueAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: BackgroundScheduler;
  private readonly deadLetterTargets: SimSqsDeadLetterTargets;
  private readonly activity: SimSqsQueueActivity;

  constructor(properties: SimSqsCreateQueueProperties) {
    this.queues = properties.queues;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
    this.deadLetterTargets = properties.deadLetterTargets;
    this.activity = properties.activity;
  }

  /**
   * Create a queue, or answer with the existing one of that name.
   */
  handle(
    command: SimCreateQueueCommand,
    options?: SimSqsRequestOptions,
  ): SimCreateQueueCommandOutput {
    const input = command.input;

    refuseUnsimulatedQueueInput(input);

    const name = SimSqsQueueName.required(input.QueueName);
    const requested = input.Attributes ?? {};

    this.access.authorizeName("sqs:CreateQueue", name.value, options);

    const existing = this.queues.find(name.value);

    if (existing !== undefined) {
      return {
        $metadata: {},
        QueueUrl: existing.urlWhenAttributesMatch(requested),
      };
    }

    return { $metadata: {}, QueueUrl: this.created(name, requested).url };
  }

  /**
   * Create the queue itself, once the name is known to be free.
   *
   * The requested attributes are applied to the new queue rather than folded
   * into its defaults, so a queue created with a redrive policy has that policy
   * checked the same way SetQueueAttributes checks one. The queue is only
   * stored once the attributes have been accepted.
   */
  private created(
    name: SimSqsQueueName,
    requested: SimSqsQueueAttributeInput,
  ): SimSqsQueue {
    const createdAt = this.clock.now();

    this.queues.assertNameAvailable(name.value, createdAt);

    const queue = new SimSqsQueue({
      name,
      accountRegionScope: this.accountRegionScope,
      attributes: SimSqsQueueAttributes.defaults(),
      createdAt,
      deadLetterTargets: this.deadLetterTargets,
      activity: this.activity,
    });

    queue.applyAttributes(requested, createdAt);
    this.queues.add(queue);

    return queue;
  }
}
