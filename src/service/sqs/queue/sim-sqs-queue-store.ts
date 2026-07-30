import { SimSqsQueueDoesNotExist } from "../error/sim-sqs.error.js";
import { SimSqsDeletedQueueNames } from "./sim-sqs-deleted-queue-names.js";
import type { SimSqsQueue } from "./sim-sqs-queue.js";

/**
 * The queues of one simulated SQS scope.
 *
 * Queues are keyed by name, which is the whole of their identity: the name is
 * the resource part of the ARN and the last segment of the URL, and it is unique
 * within one account and region.
 */
export class SimSqsQueueStore {
  private readonly queues = new Map<string, SimSqsQueue>();
  private readonly deletedNames = new SimSqsDeletedQueueNames();

  /**
   * Every queue in this scope, in creation order.
   */
  get all(): readonly SimSqsQueue[] {
    return this.queues.values().toArray();
  }

  /**
   * The queues whose names start with a prefix, in creation order.
   *
   * No prefix means every queue, as an SQS listing with no prefix lists them all.
   */
  withNamePrefix(prefix: string | undefined): readonly SimSqsQueue[] {
    return this.all.filter((queue) =>
      queue.name.value.startsWith(prefix ?? ""),
    );
  }

  /**
   * Store a newly created queue.
   */
  add(queue: SimSqsQueue): void {
    this.queues.set(queue.name.value, queue);
  }

  /**
   * Find a queue by name.
   */
  find(name: string): SimSqsQueue | undefined {
    return this.queues.get(name);
  }

  /**
   * Find a queue by its ARN.
   *
   * Whole ARNs are compared rather than the name being read out of one, which
   * keeps the Account and Region in the comparison: an ARN naming another scope
   * finds no queue here, as it names no queue this simulated SQS holds.
   */
  findByArn(arn: string): SimSqsQueue | undefined {
    return this.all.find((queue) => queue.arn.value === arn);
  }

  /**
   * Bring every queue in this scope up to date at an instant.
   *
   * A message moves to its dead-letter queue when the source queue notices its
   * visibility has lapsed, and nothing schedules that. A test that only reads
   * the dead-letter queue would otherwise find it empty, so every queue is
   * brought up to date before any one of them is answered from.
   */
  applyLifecycle(instant: Date): void {
    for (const queue of this.all) {
      queue.applyLifecycle(instant);
    }
  }

  /**
   * Resolve a queue by name, or refuse.
   */
  require(name: string): SimSqsQueue {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimSqsQueueDoesNotExist(
        `The specified queue does not exist: no queue named '${name}' in ` +
          `this Account and Region`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted queue, holding its name as real SQS holds it.
   */
  remove(queue: SimSqsQueue, deletedAt: Date): void {
    this.queues.delete(queue.name.value);
    this.deletedNames.record(queue.name.value, deletedAt);
  }

  /**
   * Refuse a name a recent deletion is still holding.
   */
  assertNameAvailable(name: string, instant: Date): void {
    this.deletedNames.assertAvailable(name, instant);
  }
}
