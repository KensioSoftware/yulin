/**
 * Something outside SQS waiting for messages to arrive on a queue.
 *
 * A Lambda event source mapping is the one this exists for: real Lambda polls a
 * queue continuously, and nothing in this simulation runs continuously, so the
 * queue says when there is something to poll for instead.
 */
export interface SimSqsQueueWatcher {
  /**
   * A message has arrived, and can be received from the given instant.
   *
   * The instant is when the message becomes visible rather than now, because a
   * message sent with a delay is not receivable yet.
   */
  messageAvailable(availableFrom: Date): void;
}

/**
 * The watchers on the queues of one simulated SQS scope.
 *
 * Watchers are held by queue ARN rather than on the queue itself, so a watcher
 * survives whatever the queue does, and so the queue model stays a queue rather
 * than a subscription list.
 */
export class SimSqsQueueActivity {
  private readonly watchers = new Map<string, SimSqsQueueWatcher[]>();

  /**
   * Watch a queue for messages arriving on it.
   */
  watch(queueArn: string, watcher: SimSqsQueueWatcher): void {
    this.watchers.set(queueArn, [...this.watchersOf(queueArn), watcher]);
  }

  /**
   * Stop watching a queue.
   */
  unwatch(queueArn: string, watcher: SimSqsQueueWatcher): void {
    this.watchers.set(
      queueArn,
      this.watchersOf(queueArn).filter((held) => held !== watcher),
    );
  }

  /**
   * Tell a queue's watchers a message has arrived on it.
   */
  messageAdded(queueArn: string, availableFrom: Date): void {
    for (const watcher of this.watchersOf(queueArn)) {
      watcher.messageAvailable(availableFrom);
    }
  }

  private watchersOf(queueArn: string): readonly SimSqsQueueWatcher[] {
    return this.watchers.get(queueArn) ?? [];
  }
}
