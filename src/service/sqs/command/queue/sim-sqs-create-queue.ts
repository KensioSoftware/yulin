import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import {
  type SimSqsQueueAttributeInput,
  SimSqsQueueAttributes,
} from "../../queue/sim-sqs-queue-attributes.js";
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
}

interface SimSqsCreateQueueOptions {
  readonly caller?: SimAwsCaller;
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

  constructor(properties: SimSqsCreateQueueProperties) {
    this.queues = properties.queues;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Create a queue, or answer with the existing one of that name.
   */
  handle(
    command: SimCreateQueueCommand,
    options?: SimSqsCreateQueueOptions,
  ): SimCreateQueueCommandOutput {
    const input = command.input;

    refuseUnsimulatedQueueInput(input);

    const name = SimSqsQueueName.required(input.QueueName);
    const requested = input.Attributes ?? {};

    this.access.authorizeName("sqs:CreateQueue", name.value, options?.caller);

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
      attributes: SimSqsQueueAttributes.defaults().with(requested),
      createdAt,
    });

    this.queues.add(queue);

    return queue;
  }
}
