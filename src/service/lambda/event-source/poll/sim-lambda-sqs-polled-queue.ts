import type {
  SimLambdaEventSourceMessage,
  SimLambdaEventSourceQueueRequest,
  SimLambdaEventSourceQueues,
  SimLambdaEventSourceQueueWatcher,
} from "../queue/sim-lambda-event-source-queues.js";

/**
 * The one queue a mapping polls.
 *
 * Every call names the same queue, and the ones a poll makes are all made as
 * the function's execution role, so both are fixed here rather than written out
 * at each call. Simulated IAM still decides each one, exactly as real IAM does.
 */
export class SimLambdaSqsPolledQueue {
  private readonly queues: SimLambdaEventSourceQueues;
  private readonly queueArn: string;

  constructor(queues: SimLambdaEventSourceQueues, queueArn: string) {
    this.queues = queues;
    this.queueArn = queueArn;
  }

  /**
   * Watch for messages arriving on the queue.
   */
  watch(watcher: SimLambdaEventSourceQueueWatcher): void {
    this.queues.watch(this.queueArn, watcher);
  }

  /**
   * Stop watching the queue.
   */
  unwatch(watcher: SimLambdaEventSourceQueueWatcher): void {
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
  async visibilityTimeoutSeconds(roleArn: string): Promise<number> {
    return await this.queues.visibilityTimeoutSeconds(this.requestAs(roleArn));
  }

  /**
   * Take up to a batch of messages off the queue.
   */
  async receive(
    roleArn: string,
    batchSize: number,
  ): Promise<readonly SimLambdaEventSourceMessage[]> {
    return await this.queues.receive({ ...this.requestAs(roleArn), batchSize });
  }

  /**
   * Delete the messages the function handled.
   */
  async deleteMessages(
    roleArn: string,
    receiptHandles: readonly string[],
  ): Promise<void> {
    await this.queues.deleteMessages({
      ...this.requestAs(roleArn),
      receiptHandles,
    });
  }

  private requestAs(roleArn: string): SimLambdaEventSourceQueueRequest {
    return { queueArn: this.queueArn, caller: { kind: "arn", arn: roleArn } };
  }
}
