/* oxlint-disable unicorn-js/prefer-await  */

import { type SimClock, SimRealClock } from "../clock/sim-clock.js";
import {
  type BackgroundDueTask,
  BackgroundDueTasks,
} from "./background-due-tasks.js";

export type BackgroundTask = () => Promise<void>;

/**
 * Scheduler for a simulator's asynchronous work, and the source of its time.
 *
 * Timekeeping and scheduling stay separate responsibilities: a scheduler holds
 * a SimClock and delegates to it, rather than implementing time itself. They
 * are combined in one interface because they travel together, so anything
 * already given a scheduler can read simulated time without extra wiring.
 */
export interface BackgroundScheduler extends SimClock {
  /**
   * Wait at a simulator sequencing point.
   *
   * The default implementation is deterministic and simply yields to the
   * microtask queue. Non-deterministic implementations may delay by a random
   * amount to simulate operations completing out of sequence.
   */
  sequence(): Promise<void>;

  schedule(task: BackgroundTask): void;

  /**
   * Schedule a task to happen once simulated time reaches an instant.
   *
   * Nothing dispatches it until the clock gets there, so scheduled work
   * happens on the simulation's timeline rather than the host's.
   */
  scheduleAt(dueTime: Date, task: BackgroundTask): void;
}

interface BackgroundTasksProperties {
  readonly clock?: SimClock;
}

export interface BackgroundCompleter {
  complete(): Promise<void>;
}

/**
 * Source of background work waiting on the clock.
 *
 * Whatever controls simulated time pulls due work from here as it moves the
 * clock, which is what makes advancing time dispatch what falls due during the
 * interval rather than everything at once at the end.
 */
export interface BackgroundDueTaskSource {
  /**
   * Take the next task due at or before an instant, earliest first.
   */
  takeNextDueBy(instant: Date): BackgroundDueTask | undefined;

  /**
   * See how many tasks are waiting for simulated time to reach them.
   */
  readonly dueTaskCount: number;
}

/**
 * Deterministic async background tasks scheduler.
 *
 * Tasks still run asynchronously, outside the current call stack, but dispatch in
 * the order they were scheduled.
 */
export class BackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter, BackgroundDueTaskSource
{
  private readonly pending = new Set<Promise<void>>();
  private readonly dueTasks = new BackgroundDueTasks();
  private readonly clock: SimClock;

  constructor(properties: BackgroundTasksProperties = {}) {
    this.clock = properties.clock ?? new SimRealClock();
  }

  /**
   * Get the current time in this simulation.
   */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Wait at a deterministic sequencing point.
   */
  sequence(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Schedule a task to happen asynchronously in the background.
   */
  schedule(task: BackgroundTask): void {
    const promise = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    })

      .then(task)
      .then(
        () => {
          //
        },
        (error: unknown) => {
          // Keep the promise rejected so complete() can surface failures
          // deterministically.
          throw error;
        },
      )
      .finally(() => {
        this.pending.delete(promise);
      });

    this.pending.add(promise);
  }

  /**
   * Schedule a task to happen once simulated time reaches an instant.
   */
  scheduleAt(dueTime: Date, task: BackgroundTask): void {
    this.dueTasks.add(dueTime, task);
  }

  /**
   * Take the next task due at or before an instant, earliest first.
   */
  takeNextDueBy(instant: Date): BackgroundDueTask | undefined {
    return this.dueTasks.takeNextDueBy(instant);
  }

  /**
   * Wait until all tasks currently scheduled have finished.
   * If tasks schedule more tasks, this will continue draining until idle.
   *
   * Work waiting on the clock is not waited for: it is not outstanding, it is
   * scheduled for a simulated instant that has not arrived. Only moving the
   * clock releases it.
   */
  public async complete(): Promise<void> {
    while (this.pending.size > 0) {
      // oxlint-disable-next-line no-await-in-loop
      await Promise.all(this.pending);
    }
  }

  /**
   * See how many outstanding background tasks are scheduled.
   */
  public get pendingTaskCount(): number {
    return this.pending.size;
  }

  /**
   * See how many tasks are waiting for simulated time to reach them.
   */
  public get dueTaskCount(): number {
    return this.dueTasks.size;
  }
}
