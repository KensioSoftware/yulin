import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimSqsQueueStore } from "./sim-sqs-queue-store.js";

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

interface SimSqsQueueActivityProperties {
  readonly queues: SimSqsQueueStore;
  readonly clock: SimClock;
}

/**
 * What a consumer that cannot poll continuously needs from the queues of one
 * simulated SQS scope: to be told when a message can next be received, and to
 * be able to ask when none has been announced.
 *
 * Watchers are held by queue ARN rather than on the queue itself, so a watcher
 * survives whatever the queue does, and so the queue model stays a queue rather
 * than a subscription list.
 */
export class SimSqsQueueActivity {
  private readonly watchers = new Map<string, SimSqsQueueWatcher[]>();
  private readonly queues: SimSqsQueueStore;
  private readonly clock: SimClock;

  constructor(properties: SimSqsQueueActivityProperties) {
    this.queues = properties.queues;
    this.clock = properties.clock;
  }

  /**
   * When the earliest message a queue cannot hand out yet becomes receivable,
   * or nothing when it holds no such message.
   *
   * A consumer that started watching a queue whose messages were all in flight
   * or delayed has nothing to wake it, because their arrival was announced
   * before it was watching. Asking is how it finds out when to look.
   */
  nextAvailability(queueArn: string): Date | undefined {
    return this.queues.findByArn(queueArn)?.nextAvailability(this.clock.now());
  }

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
   * Tell a queue's watchers when a message on it can next be received.
   *
   * A message arriving, a message being handed out and hidden, and a message
   * having its visibility changed are all the same thing to a watcher: there is
   * something to poll for at an instant.
   */
  messageAvailableAt(queueArn: string, availableFrom: Date): void {
    for (const watcher of this.watchersOf(queueArn)) {
      watcher.messageAvailable(availableFrom);
    }
  }

  private watchersOf(queueArn: string): readonly SimSqsQueueWatcher[] {
    return this.watchers.get(queueArn) ?? [];
  }
}
