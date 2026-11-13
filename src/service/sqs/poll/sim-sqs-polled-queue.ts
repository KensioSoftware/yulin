import type { BackgroundScheduler } from "../../../util/background/background.js";
import { BatchingWindow } from "../../../util/background/batching-window.js";
import type { PollSchedule } from "../../../util/background/poll-schedule.js";
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
  private readonly background: BackgroundScheduler;
  private readonly window = new BatchingWindow();

  constructor(properties: {
    readonly queues: SimSqsPollQueues;
    readonly queueArn: string;
    readonly background: BackgroundScheduler;
  }) {
    this.queues = properties.queues;
    this.queueArn = properties.queueArn;
    this.background = properties.background;
  }

  /**
   * Whether a poll holds what the queue has back for the consumer's batching
   * window, scheduling the poll that looks again when the window closes.
   */
  holds(
    batching: {
      readonly batchSize: number;
      readonly batchingWindowSeconds?: number | undefined;
    },
    schedule: PollSchedule,
  ): boolean {
    return this.window.holds(
      this.background.now(),
      this.receivableCount(),
      batching,
      (instant) => {
        schedule.at(instant);
      },
      // A delayed message becoming receivable may fill the batch first.
      this.nextAvailability(),
    );
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
   * How many messages the queue could hand out now.
   */
  receivableCount(): number {
    return this.queues.receivableCount(this.queueArn);
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
