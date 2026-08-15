import { sqsQueueArnOf } from "../../sqs/queue/sim-sqs-queue-arn.js";
import type {
  SimEcsContainerConsumeHandler,
  SimEcsContainerQueueConsumer,
  SimEcsQueueMessage,
} from "./sim-ecs-container-binding.type.js";

/**
 * How many messages a consuming container is handed at once when it does not
 * say, which is as many as one SQS receive will ever hand out.
 */
const defaultBatchSize = 10;

/**
 * The largest batch SQS hands out in one receive.
 */
const maximumBatchSize = 10;

/**
 * The queue one bound container consumes, read once as the binding is made.
 *
 * Everything about it is settled here rather than at the first poll, because
 * binding is something a test does while setting up and that is where a
 * mistake in it is worth reporting. A queue URL that names no queue, a batch
 * size SQS would refuse and a handler that is not a function are all the same
 * kind of mistake: the container would poll for the whole test and deliver
 * nothing.
 */
export class SimEcsBoundQueueConsumer {
  public readonly queueUrl: string;
  public readonly queueArn: string;
  public readonly batchSize: number;

  private readonly handler: SimEcsContainerConsumeHandler;

  constructor(declared: SimEcsContainerQueueConsumer) {
    this.queueUrl = declared.queueUrl;
    this.queueArn = SimEcsBoundQueueConsumer.queueArnOf(declared.queueUrl);
    this.batchSize = SimEcsBoundQueueConsumer.batchSizeOf(declared.batchSize);
    this.handler = SimEcsBoundQueueConsumer.handlerOf(declared.handler);
  }

  private static queueArnOf(queueUrl: string): string {
    try {
      return sqsQueueArnOf(queueUrl);
    } catch (error) {
      throw new Error(
        "Invalid sim ECS container binding: a consuming container names its " +
          "queue by the URL CreateQueue answered with.",
        { cause: error },
      );
    }
  }

  private static batchSizeOf(batchSize: number | undefined): number {
    if (batchSize === undefined) {
      return defaultBatchSize;
    }

    if (
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > maximumBatchSize
    ) {
      throw new RangeError(
        `Invalid sim ECS container binding: a batch size of ${batchSize} is ` +
          `not one SQS hands out, which is a whole number from 1 to ` +
          `${maximumBatchSize}.`,
      );
    }

    return batchSize;
  }

  private static handlerOf(
    handler: SimEcsContainerConsumeHandler,
  ): SimEcsContainerConsumeHandler {
    if (typeof handler !== "function") {
      throw new TypeError(
        "Invalid sim ECS container binding: a consuming container needs a " +
          "handler, which is what its loop would do with a batch of messages.",
      );
    }

    return handler;
  }

  /**
   * Hand one batch of messages to this container.
   *
   * Whatever the handler throws is left to whoever asked, because that is what
   * decides whether the batch is deleted or goes back on the queue.
   */
  async handle(messages: readonly SimEcsQueueMessage[]): Promise<void> {
    await this.handler(messages);
  }
}
