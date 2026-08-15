import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSqsQueueWatcher } from "../queue/sim-sqs-queue-activity.js";
import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";

/**
 * A poller's request to the queue it polls, made as the identity the consumer
 * runs under, so simulated IAM applies to it as real IAM does.
 */
export interface SimSqsPollQueueRequest {
  readonly queueArn: string;
  readonly caller: SimAwsCaller;
}

/**
 * A poller's request for a batch of messages.
 */
export interface SimSqsPollReceiveRequest extends SimSqsPollQueueRequest {
  readonly batchSize: number;
}

/**
 * A poller's request to delete the messages it handled.
 */
export interface SimSqsPollDeleteRequest extends SimSqsPollQueueRequest {
  readonly receiptHandles: readonly string[];
}

/**
 * The queues a simulated consumer polls.
 *
 * This is the narrow slice of simulated SQS that polling needs, kept as an
 * interface so a consumer depends on what it does with a queue rather than on
 * the SQS service object. Every operation carries the caller, because polling
 * on real AWS is done with the consumer's own role and is refused when that
 * role has no permission for it.
 */
export interface SimSqsPollQueues {
  /**
   * How long a received message stays hidden, and by asking, whether the queue
   * is there to be polled at all.
   */
  visibilityTimeoutSeconds(request: SimSqsPollQueueRequest): Promise<number>;

  /**
   * Take up to a batch of messages off the queue.
   */
  receive(
    request: SimSqsPollReceiveRequest,
  ): Promise<readonly SimSqsPollMessage[]>;

  /**
   * Delete the messages a batch has been handled successfully.
   */
  deleteMessages(request: SimSqsPollDeleteRequest): Promise<void>;

  /**
   * When the earliest message the queue cannot hand out yet becomes
   * receivable, or nothing when it holds no such message.
   *
   * A poll that found nothing asks this, because a queue whose messages are all
   * in flight or delayed has nothing to announce when they come back.
   */
  nextAvailability(queueArn: string): Date | undefined;

  /**
   * Watch a queue for messages arriving on it.
   */
  watch(queueArn: string, watcher: SimSqsQueueWatcher): void;

  /**
   * Stop watching a queue.
   */
  unwatch(queueArn: string, watcher: SimSqsQueueWatcher): void;
}

/**
 * The queues a consumer built outside a SimAws instance can reach, which is
 * none of them.
 *
 * A simulated service that polls is usually built through a SimAws instance,
 * which hands it that simulation's SQS. One built by itself has no queue to
 * reach, so it refuses and says how to get one rather than quietly delivering
 * nothing. What the refusal says is the consuming service's own, which is why
 * the reason is the one thing left to whatever extends this.
 */
export abstract class SimSqsUnreachablePollQueues implements SimSqsPollQueues {
  /**
   * Why this consumer cannot reach the queue it was asked to poll.
   */
  protected abstract unreachable(queueArn: string): Error;

  /**
   * Refuse to look at a queue, explaining how to reach one.
   */
  visibilityTimeoutSeconds(request: SimSqsPollQueueRequest): Promise<number> {
    return Promise.reject(this.unreachable(request.queueArn));
  }

  /**
   * Refuse to poll, explaining how to reach a queue.
   */
  receive(
    request: SimSqsPollReceiveRequest,
  ): Promise<readonly SimSqsPollMessage[]> {
    return Promise.reject(this.unreachable(request.queueArn));
  }

  /**
   * Refuse to delete, explaining how to reach a queue.
   */
  deleteMessages(request: SimSqsPollDeleteRequest): Promise<void> {
    return Promise.reject(this.unreachable(request.queueArn));
  }

  /**
   * Answer with nothing: there is no queue to look at.
   */
  nextAvailability(): Date | undefined {
    return;
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
}
