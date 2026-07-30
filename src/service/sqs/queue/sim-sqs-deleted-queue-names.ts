import { SimSqsQueueDeletedRecently } from "../error/sim-sqs.error.js";

/**
 * Real SQS holds a deleted queue's name for 60 seconds before it can be used
 * again.
 */
const nameHoldSeconds = 60;

const millisecondsPerSecond = 1000;

/**
 * The queue names a deletion is still holding.
 *
 * This is the SQS version of a behaviour that bites a redeployed stack: a queue
 * deleted a moment ago still owns its name, so recreating it fails. The hold is
 * measured on the simulation's clock, so advancing simulated time past it frees
 * the name, rather than a test having to wait a real minute.
 */
export class SimSqsDeletedQueueNames {
  private readonly deletedAt = new Map<string, Date>();

  /**
   * Record that a queue with this name has just been deleted.
   */
  record(name: string, instant: Date): void {
    this.deletedAt.set(name, instant);
  }

  /**
   * Refuse a name a recent deletion is still holding.
   */
  assertAvailable(name: string, instant: Date): void {
    const deletion = this.deletedAt.get(name);

    if (deletion === undefined) {
      return;
    }

    const heldUntil =
      deletion.getTime() + nameHoldSeconds * millisecondsPerSecond;

    if (instant.getTime() >= heldUntil) {
      this.deletedAt.delete(name);

      return;
    }

    throw new SimSqsQueueDeletedRecently(
      `You must wait ${String(nameHoldSeconds)} seconds after deleting a ` +
        `queue before you can create another with the same name. Queue ` +
        `'${name}' was deleted at ${deletion.toISOString()}.`,
    );
  }
}
