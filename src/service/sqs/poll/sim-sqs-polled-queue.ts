import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSqsQueueWatcher } from "../queue/sim-sqs-queue-activity.js";
import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";
import type { SimSqsPollQueues } from "./sim-sqs-poll-queues.js";

/**
 * The one queue a consumer polls.
 *
 * Every call names the same queue, so it is fixed here rather than written out
 * at each call. The caller is not: it belongs to the consumer, and simulated
 * IAM decides each request against it exactly as real IAM does.
 */
export class SimSqsPolledQueue {
  private readonly queues: SimSqsPollQueues;
  private readonly queueArn: string;

  constructor(queues: SimSqsPollQueues, queueArn: string) {
    this.queues = queues;
    this.queueArn = queueArn;
  }

  /**
   * Watch for messages arriving on the queue.
   */
  watch(watcher: SimSqsQueueWatcher): void {
    this.queues.watch(this.queueArn, watcher);
  }

  /**
   * Stop watching the queue.
   */
  unwatch(watcher: SimSqsQueueWatcher): void {
    this.queues.unwatch(this.queueArn, watcher);
  }

  /**
   * When the earliest message the queue cannot hand out yet becomes
   * receivable.
   */
  nextAvailability(): Date | undefined {
    return this.queues.nextAvailability(this.queueArn);
  }

  /**
   * How long a received message stays hidden, and by asking, whether the queue
   * is there to be polled at all.
   */
  async visibilityTimeoutSeconds(caller: SimAwsCaller): Promise<number> {
    return await this.queues.visibilityTimeoutSeconds(this.requestAs(caller));
  }

  /**
   * Take up to a batch of messages off the queue.
   */
  async receive(
    caller: SimAwsCaller,
    batchSize: number,
  ): Promise<readonly SimSqsPollMessage[]> {
    return await this.queues.receive({ ...this.requestAs(caller), batchSize });
  }

  /**
   * Delete the messages the consumer handled.
   */
  async deleteMessages(
    caller: SimAwsCaller,
    receiptHandles: readonly string[],
  ): Promise<void> {
    await this.queues.deleteMessages({
      ...this.requestAs(caller),
      receiptHandles,
    });
  }

  private requestAs(caller: SimAwsCaller): {
    queueArn: string;
    caller: SimAwsCaller;
  } {
    return { queueArn: this.queueArn, caller };
  }
}
