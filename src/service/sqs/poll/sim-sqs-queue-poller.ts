import type { BackgroundScheduler } from "../../../util/background/background.js";
import { PollSchedule } from "../../../util/background/poll-schedule.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSqsQueueWatcher } from "../queue/sim-sqs-queue-activity.js";
import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";
import type { SimSqsPollQueues } from "./sim-sqs-poll-queues.js";
import { SimSqsPolledQueue } from "./sim-sqs-polled-queue.js";

/**
 * What became of one batch handed to a consumer.
 *
 * A batch is either deleted from the queue or left on it to be handed out
 * again once its visibility timeout has run. Partial batch responses split it,
 * which is the only reason this says both rather than yes or no.
 */
export interface SimSqsPollOutcome {
  readonly handledReceiptHandles: readonly string[];
  readonly hasReturnedMessages: boolean;
}

/**
 * What one poll is made on behalf of.
 *
 * The caller is what receiving and deleting are authorized as, and the batch
 * size is how many messages the consumer wants at once. Both are read per poll
 * rather than held, because a consumer can change either while it is running.
 */
export interface SimSqsPollSession {
  readonly caller: SimAwsCaller;
  readonly batchSize: number;

  /**
   * Hand a batch to whatever consumes it, answering with what became of it.
   */
  handle(messages: readonly SimSqsPollMessage[]): Promise<SimSqsPollOutcome>;
}

/**
 * Whatever is consuming a queue through a poller.
 *
 * A poller asks for a session rather than being handed one, because a consumer
 * can be temporarily in no state to consume: a Lambda event source mapping
 * still being created, or one whose function has gone.
 */
export interface SimSqsPollConsumer {
  /**
   * The session this poll runs in, or nothing when there is nothing to poll
   * for at the moment.
   */
  session(): SimSqsPollSession | undefined;
}

interface SimSqsQueuePollerProperties {
  readonly queues: SimSqsPollQueues;
  readonly queueArn: string;
  readonly consumer: SimSqsPollConsumer;
  readonly background: BackgroundScheduler;
}

/**
 * Polls one queue on behalf of one consumer.
 *
 * Real consumers poll continuously, and nothing in this simulation runs
 * continuously: an endless loop in a single Node.js process would never yield
 * to the test running it. So the queue says when a message has arrived and a
 * poll is scheduled in response, on the simulation's own clock. A test that
 * awaits the simulation settling has therefore watched the whole delivery
 * happen, rather than having waited a while and hoped.
 *
 * A batch the consumer handled is deleted from the queue. A batch it did not is
 * left there, which hides it for the visibility timeout and hands it back
 * afterwards, so a redrive policy eventually gives up on it exactly as it would
 * for any other failing consumer.
 *
 * A Lambda event source mapping and a long-running ECS container both consume a
 * queue this way. What differs between them is what a batch is handed to and
 * what a role it is read as, which is what the session carries, so the loop
 * itself is written once.
 */
export class SimSqsQueuePoller implements SimSqsQueueWatcher {
  private readonly consumer: SimSqsPollConsumer;
  private readonly queue: SimSqsPolledQueue;
  private readonly schedule: PollSchedule;

  private stopped = false;

  constructor(properties: SimSqsQueuePollerProperties) {
    this.consumer = properties.consumer;
    this.queue = new SimSqsPolledQueue(properties.queues, properties.queueArn);
    this.schedule = new PollSchedule({
      background: properties.background,
      poll: async (): Promise<void> => {
        await this.run();
      },
    });
  }

  /**
   * Watch the queue, so a message arriving on it wakes a poll.
   *
   * Watching can start before the consumer is ready to consume, so that a
   * message sent in between is not missed. The poll it wakes finds a consumer
   * with no session and does nothing, and the poll that follows picks the
   * message up.
   */
  watch(): void {
    this.queue.watch(this);
  }

  /**
   * Poll as soon as the simulation gets to it, which is what a consumer that
   * has just started does with whatever is already on its queue.
   */
  pollNow(): void {
    this.schedule.now();
  }

  /**
   * Stop polling, as the consumer going away does.
   *
   * Nothing is left watching the queue and no turn is left waiting on the
   * clock, so a consumer that has gone leaves the simulation with nothing
   * scheduled on its behalf.
   */
  stop(): void {
    this.stopped = true;
    this.queue.unwatch(this);
    this.schedule.stop();
  }

  /**
   * Take a message arriving on the queue as something to poll for.
   *
   * Nothing reaches here after stopping, because stopping gives up watching the
   * queue in the same breath.
   */
  messageAvailable(availableFrom: Date): void {
    this.schedule.at(availableFrom);
  }

  /**
   * Poll once: one batch, handed over and then deleted or left behind.
   */
  private async run(): Promise<void> {
    const session = this.session();

    if (session === undefined) {
      return;
    }

    const { caller } = session;
    const timeout = await this.queue.visibilityTimeoutSeconds(caller);
    const messages = await this.queue.receive(caller, session.batchSize);

    if (messages.length === 0) {
      this.pollWhenSomethingComesBack();

      return;
    }

    const outcome = await session.handle(messages);

    await this.queue.deleteMessages(caller, outcome.handledReceiptHandles);

    this.pollAgainAfter(outcome, messages.length, session.batchSize, timeout);
  }

  /**
   * The session this poll runs in, while there is anything to poll for.
   */
  private session(): SimSqsPollSession | undefined {
    if (this.stopped) {
      return undefined;
    }

    return this.consumer.session();
  }

  /**
   * Look again when a message the queue could not hand out becomes receivable.
   *
   * A consumer that started while every message on its queue was in flight, or
   * one whose queue holds only delayed messages, has nothing to wake it
   * otherwise.
   */
  private pollWhenSomethingComesBack(): void {
    const availableFrom = this.queue.nextAvailability();

    if (availableFrom !== undefined) {
      this.schedule.at(availableFrom);
    }
  }

  /**
   * Decide when to poll again: when a returned batch becomes visible again, or
   * straight away when a batch filled the request and there may be more
   * waiting.
   */
  private pollAgainAfter(
    outcome: SimSqsPollOutcome,
    receivedCount: number,
    batchSize: number,
    visibilityTimeoutSeconds: number,
  ): void {
    if (outcome.hasReturnedMessages) {
      this.schedule.afterSeconds(visibilityTimeoutSeconds);

      return;
    }

    if (receivedCount >= batchSize) {
      this.schedule.now();
    }
  }
}
