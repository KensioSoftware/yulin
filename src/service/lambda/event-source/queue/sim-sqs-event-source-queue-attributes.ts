import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceQueueRequest } from "./sim-lambda-event-source-queues.js";
import type { SimLambdaEventSourceQueueService } from "./sim-lambda-event-source-queue-service.js";
import { SimLambdaSqsEventSourceArn } from "./sim-lambda-sqs-event-source-arn.js";

const defaultVisibilityTimeoutSeconds = 30;

interface SimSqsEventSourceQueueAttributesProperties {
  readonly sqs: SimLambdaEventSourceQueueService;
}

/**
 * What a poller reads about the queue it polls.
 *
 * Only the visibility timeout, which is how long a returned batch stays hidden
 * before it is delivered again. Asking for it is also how a mapping finds out
 * the queue is there at all, which is why real Lambda wants
 * `sqs:GetQueueAttributes` on a queue it is asked to poll.
 */
export class SimSqsEventSourceQueueAttributes {
  private readonly sqs: SimLambdaEventSourceQueueService;

  constructor(properties: SimSqsEventSourceQueueAttributesProperties) {
    this.sqs = properties.sqs;
  }

  /**
   * How long a received message stays hidden, as the queue reports it.
   */
  async visibilityTimeoutSeconds(
    request: SimLambdaEventSourceQueueRequest,
  ): Promise<number> {
    const attributes = await this.read(request);

    return Number(
      attributes["VisibilityTimeout"] ?? defaultVisibilityTimeoutSeconds,
    );
  }

  /**
   * Read a queue's attributes as the execution role, reporting a queue that is
   * not there the way real Lambda reports an event source it cannot reach.
   */
  private async read(
    request: SimLambdaEventSourceQueueRequest,
  ): Promise<Record<string, string>> {
    try {
      const output = await this.sqs.getQueueAttributes(
        {
          input: {
            QueueUrl: SimLambdaSqsEventSourceArn.of(request.queueArn).queueUrl,
            AttributeNames: ["VisibilityTimeout"],
          },
        },
        { caller: request.caller },
      );

      return output.Attributes ?? {};
    } catch (error) {
      throw this.queueLookupError(error, request.queueArn);
    }
  }

  private queueLookupError(error: unknown, queueArn: string): unknown {
    if (error instanceof Error && error.name === "QueueDoesNotExist") {
      return new SimLambdaInvalidParameterValueException(
        `The event source ${queueArn} does not exist`,
        { cause: error },
      );
    }

    return error;
  }
}
