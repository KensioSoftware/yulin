import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../util/background/background.js";
import type { SimFirehoseDeliveryStream } from "../stream/sim-firehose-delivery-stream.js";
import type { SimFirehoseObjectWriter } from "./sim-firehose-object-writer.js";

interface SimFirehoseDeliveryProperties {
  readonly background: BackgroundScheduler;
  readonly writer: SimFirehoseObjectWriter;
}

/**
 * When each delivery stream's buffer is written out.
 *
 * Firehose delivers a buffer once it passes either of its two bounds. The size
 * bound is checked as each record arrives. The interval bound is a task
 * scheduled on the clock for the instant the buffer is due, which is why
 * advancing simulated time past the interval is what makes a delivery happen.
 *
 * The due task is scheduled when a record lands on an empty buffer, so the
 * interval runs from the first record of a buffer rather than from the last.
 * That is the window real Firehose measures.
 */
export class SimFirehoseDelivery {
  private readonly background: BackgroundScheduler;
  private readonly writer: SimFirehoseObjectWriter;
  private readonly due = new Map<SimFirehoseDeliveryStream, BackgroundTask>();

  constructor(properties: SimFirehoseDeliveryProperties) {
    this.background = properties.background;
    this.writer = properties.writer;
  }

  /**
   * Take a record onto a delivery stream's buffer, and deliver if it is full.
   *
   * A size delivery happens on the background scheduler rather than inside the
   * put, as real Firehose answers the producer before it writes anything.
   * `simAws.backgroundTasksComplete()` is what waits for it.
   */
  accept(deliveryStream: SimFirehoseDeliveryStream, data: Uint8Array): void {
    const wasEmpty = deliveryStream.buffer.isEmpty;

    deliveryStream.buffer.add(data);

    if (deliveryStream.isBufferFull) {
      this.cancelDue(deliveryStream);
      this.background.schedule(async () => {
        await this.deliver(deliveryStream);
      });

      return;
    }

    if (wasEmpty) {
      this.scheduleDue(deliveryStream);
    }
  }

  /**
   * Stop a deleted delivery stream delivering.
   *
   * Real Firehose delivers whatever a deleted delivery stream was holding
   * before it goes. Nothing here does, because the Object would land after the
   * delivery stream it names has gone and a test would have no way to expect
   * it.
   */
  forget(deliveryStream: SimFirehoseDeliveryStream): void {
    this.cancelDue(deliveryStream);
    deliveryStream.buffer.take();
  }

  private scheduleDue(deliveryStream: SimFirehoseDeliveryStream): void {
    const task = async (): Promise<void> => {
      await this.deliver(deliveryStream);
    };
    const dueTime = new Date(
      this.background.now().getTime() +
        deliveryStream.destination.bufferingHints.intervalInMilliseconds,
    );

    this.due.set(deliveryStream, task);
    this.background.scheduleAt(dueTime, task);
  }

  private cancelDue(deliveryStream: SimFirehoseDeliveryStream): void {
    const task = this.due.get(deliveryStream);

    if (task === undefined) {
      return;
    }

    this.due.delete(deliveryStream);
    this.background.cancelScheduled(task);
  }

  private async deliver(
    deliveryStream: SimFirehoseDeliveryStream,
  ): Promise<void> {
    this.due.delete(deliveryStream);

    await this.writer.write(deliveryStream, this.background.now());
  }
}
