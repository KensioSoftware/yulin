import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimLambdaError } from "../../error/sim-lambda.error.js";

/**
 * One message attribute as a queue reports it.
 */
export interface SimLambdaEventSourceMessageAttribute {
  readonly DataType?: string | undefined;
  readonly StringValue?: string | undefined;
  readonly BinaryValue?: Uint8Array | undefined;
  readonly StringListValues?: readonly string[] | undefined;
  readonly BinaryListValues?: readonly Uint8Array[] | undefined;
}

/**
 * One message as a queue hands it to a poller.
 *
 * These are the queue's own field names rather than the event's: what the
 * poller receives is a message, and turning it into an SQS event record is the
 * event builder's job.
 */
export interface SimLambdaEventSourceMessage {
  readonly MessageId: string;
  readonly ReceiptHandle: string;
  readonly MD5OfBody: string;
  readonly Body: string;
  readonly Attributes?: Record<string, string> | undefined;
  readonly MessageAttributes?:
    Record<string, SimLambdaEventSourceMessageAttribute> | undefined;
}

/**
 * A poller's request to the queue it polls, made as the function's execution
 * role so simulated IAM applies to it as it does on real Lambda.
 */
export interface SimLambdaEventSourceQueueRequest {
  readonly queueArn: string;
  readonly caller: SimAwsCaller;
}

export interface SimLambdaEventSourceReceiveRequest extends SimLambdaEventSourceQueueRequest {
  readonly batchSize: number;
}

export interface SimLambdaEventSourceDeleteRequest extends SimLambdaEventSourceQueueRequest {
  readonly receiptHandles: readonly string[];
}

/**
 * Something watching a queue on a poller's behalf.
 */
export interface SimLambdaEventSourceQueueWatcher {
  messageAvailable(availableFrom: Date): void;
}

/**
 * The queues a simulated Lambda event source mapping polls.
 *
 * This is the narrow slice of simulated SQS that polling needs, kept as an
 * interface so Lambda depends on what it does with a queue rather than on the
 * SQS service object. Every operation carries the caller, because polling on
 * real Lambda is done with the function's execution role and is refused when
 * that role has no permission for it.
 */
export interface SimLambdaEventSourceQueues {
  /**
   * How long a received message stays hidden, and by asking, whether the queue
   * is there to be polled at all.
   */
  visibilityTimeoutSeconds(
    request: SimLambdaEventSourceQueueRequest,
  ): Promise<number>;

  /**
   * Take up to a batch of messages off the queue.
   */
  receive(
    request: SimLambdaEventSourceReceiveRequest,
  ): Promise<readonly SimLambdaEventSourceMessage[]>;

  /**
   * Delete the messages a batch has been handled successfully.
   */
  deleteMessages(request: SimLambdaEventSourceDeleteRequest): Promise<void>;

  /**
   * Watch a queue for messages arriving on it.
   */
  watch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void;

  /**
   * Stop watching a queue.
   */
  unwatch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void;
}

/**
 * Event source queues used when no simulated SQS is wired up, such as for a
 * standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoEventSourceQueues implements SimLambdaEventSourceQueues {
  /**
   * Refuse to look at a queue, explaining how to reach one.
   */
  visibilityTimeoutSeconds(
    request: SimLambdaEventSourceQueueRequest,
  ): Promise<number> {
    return Promise.reject(this.noQueues(request.queueArn));
  }

  /**
   * Refuse to poll, explaining how to reach a queue.
   */
  receive(
    request: SimLambdaEventSourceReceiveRequest,
  ): Promise<readonly SimLambdaEventSourceMessage[]> {
    return Promise.reject(this.noQueues(request.queueArn));
  }

  /**
   * Refuse to delete, explaining how to reach a queue.
   */
  deleteMessages(request: SimLambdaEventSourceDeleteRequest): Promise<void> {
    return Promise.reject(this.noQueues(request.queueArn));
  }

  /**
   * Watch nothing: there is no queue to watch.
   */
  watch(): void {
    //
  }

  /**
   * Stop watching nothing.
   */
  unwatch(): void {
    //
  }

  private noQueues(queueArn: string): SimLambdaError {
    return new SimLambdaError(
      `Cannot poll ${queueArn}: this SimLambda has no simulated SQS to poll. ` +
        "Create the event source mapping through SimAws, or construct " +
        "SimLambda with eventSourceQueues.",
    );
  }
}
