import type { BackgroundTask } from "./background.js";

/**
 * A background task waiting for simulated time to reach it.
 */
export class BackgroundDueTask {
  public readonly dueTime: Date;
  public readonly task: BackgroundTask;

  constructor(dueTime: Date, task: BackgroundTask) {
    this.dueTime = new Date(dueTime);
    this.task = task;
  }

  /**
   * Whether simulated time reaching this instant makes this task due.
   */
  isDueBy(instant: Date): boolean {
    return this.dueTime.getTime() <= instant.getTime();
  }
}

/**
 * Background work waiting on the clock rather than on the event loop.
 *
 * A simulator's asynchronous work divides in two. Most of it is due
 * immediately and only needs to happen outside the current call stack, which is
 * what the scheduler's pending set is for. The rest is due at a simulated
 * instant, and should not happen at all until simulated time reaches it, no
 * matter how long the host process runs. This queue holds the second kind, so
 * advancing the clock is what releases it.
 */
export class BackgroundDueTasks {
  private readonly queued: BackgroundDueTask[] = [];

  /**
   * Queue a task to become due at a simulated instant.
   */
  add(dueTime: Date, task: BackgroundTask): void {
    this.queued.push(new BackgroundDueTask(dueTime, task));
  }

  /**
   * Take the next task due at or before an instant, earliest first.
   *
   * Tasks due at the same instant come out in the order they were queued, so
   * two things scheduled for the same simulated moment still happen in a
   * predictable order.
   */
  takeNextDueBy(instant: Date): BackgroundDueTask | undefined {
    const next = this.nextDueBy(instant);

    if (next === undefined) {
      return undefined;
    }

    this.queued.splice(this.queued.indexOf(next), 1);

    return next;
  }

  /**
   * Give up on every queued turn of a task.
   *
   * Something that polls schedules its next turn on the clock, so stopping it
   * has to take that turn off the queue as well: leaving it there would leave a
   * discarded simulation with work still waiting to happen.
   */
  cancel(task: BackgroundTask): void {
    const remaining = this.queued.filter((queued) => queued.task !== task);

    this.queued.length = 0;
    this.queued.push(...remaining);
  }

  /**
   * See how many tasks are waiting for simulated time to reach them.
   */
  get size(): number {
    return this.queued.length;
  }

  private nextDueBy(instant: Date): BackgroundDueTask | undefined {
    let earliest: BackgroundDueTask | undefined;

    for (const queued of this.queued) {
      if (!queued.isDueBy(instant)) {
        continue;
      }

      if (
        earliest === undefined ||
        queued.dueTime.getTime() < earliest.dueTime.getTime()
      ) {
        earliest = queued;
      }
    }

    return earliest;
  }
}
