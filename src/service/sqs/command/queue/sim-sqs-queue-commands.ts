import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimSqsQueueStore } from "../../queue/sim-sqs-queue-store.js";
import type { SimSqsQueueAccess } from "./sim-sqs-queue-access.js";
import { SimSqsQueuePage } from "./sim-sqs-queue-page.js";
import { refuseForeignQueueOwner } from "./sim-sqs-unsimulated-queue-input.js";
import type {
  SimDeleteQueueCommand,
  SimDeleteQueueCommandOutput,
  SimGetQueueUrlCommand,
  SimGetQueueUrlCommandOutput,
  SimListQueuesCommand,
  SimListQueuesCommandOutput,
} from "./queue.command.js";

interface SimSqsQueueCommandsProperties {
  readonly queues: SimSqsQueueStore;
  readonly access: SimSqsQueueAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
}

interface SimSqsQueueCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that find and delete queues.
 */
export class SimSqsQueueCommands {
  private readonly queues: SimSqsQueueStore;
  private readonly access: SimSqsQueueAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsQueueCommandsProperties) {
    this.queues = properties.queues;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Get the URL of a queue by name.
   */
  getQueueUrl(
    command: SimGetQueueUrlCommand,
    options?: SimSqsQueueCommandsOptions,
  ): SimGetQueueUrlCommandOutput {
    refuseForeignQueueOwner(
      command.input.QueueOwnerAWSAccountId,
      this.accountRegionScope.accountId,
    );

    const queue = this.access.requireByName(
      "sqs:GetQueueUrl",
      command.input.QueueName,
      options?.caller,
    );

    return { $metadata: {}, QueueUrl: queue.url };
  }

  /**
   * List the queues in this scope, oldest first.
   *
   * Real SQS gives this action no queue-level permission, so it authorizes
   * against every queue in the account and region and does not filter the list
   * by what the caller can reach.
   */
  listQueues(
    command: SimListQueuesCommand,
    options?: SimSqsQueueCommandsOptions,
  ): SimListQueuesCommandOutput {
    const input = command.input;

    this.access.authorizeAnyQueue("sqs:ListQueues", options?.caller);

    const page = new SimSqsQueuePage(
      this.queues.withNamePrefix(input.QueueNamePrefix),
      input,
    );

    return {
      $metadata: {},
      QueueUrls: page.queues.map((queue) => queue.url),
      NextToken: page.nextToken,
    };
  }

  /**
   * Delete a queue and everything on it.
   *
   * The queue goes at once here, where real SQS may take up to a minute over it.
   * The name it held is not free straight away either way: real SQS refuses to
   * reuse it for 60 seconds, and so does this.
   */
  deleteQueue(
    command: SimDeleteQueueCommand,
    options?: SimSqsQueueCommandsOptions,
  ): SimDeleteQueueCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:DeleteQueue",
      command.input.QueueUrl,
      options?.caller,
    );

    this.queues.remove(queue, this.clock.now());

    return { $metadata: {} };
  }
}
