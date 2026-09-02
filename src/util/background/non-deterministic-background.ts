import type {
  BackgroundCompleter,
  BackgroundDueTaskSource,
  BackgroundScheduler,
  BackgroundTask,
} from "./background.js";
import { type SimClock, SimRealClock } from "../clock/sim-clock.js";
import { BackgroundPendingTasks } from "./background-pending-tasks.js";
import {
  type BackgroundDueTask,
  BackgroundDueTasks,
} from "./background-due-tasks.js";
import { BackgroundJitter } from "./background-jitter.js";

/* oxlint-disable unicorn-js/prefer-await  */

/**
 * Non-deterministic async background tasks scheduler.
 *
 * Use this when you want to simulate asynchronous distributed operations
 * potentially completing out of sequence.
 */
export class NonDeterministicBackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter, BackgroundDueTaskSource
{
  private readonly pending = new BackgroundPendingTasks();
  private readonly dueTasks = new BackgroundDueTasks();
  private readonly jitter: BackgroundJitter;
  private readonly clock: SimClock;

  constructor(properties: { maxJitterMs?: number; clock?: SimClock } = {}) {
    const { maxJitterMs, clock = new SimRealClock() } = properties;
    this.jitter = new BackgroundJitter(maxJitterMs);
    this.clock = clock;
  }

  /**
   * Get the current time in this simulation.
   */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Wait at a non-deterministic sequencing point.
   */
  async sequence(): Promise<void> {
    await this.jitter.wait();
  }

  /**
   * Schedule a task to happen asynchronously in the background.
   */
  schedule(task: BackgroundTask): void {
    this.pending.hold(async () => {
      await this.sequence();

      await task();
    });
  }

  /**
   * Run a task that is already due, keeping it outstanding until it settles.
   */
  runDue(task: BackgroundTask): void {
    this.pending.hold(task);
  }

  /**
   * Count work a caller started as outstanding until it settles.
   */
  async outstanding<T>(work: () => Promise<T>): Promise<T> {
    return await this.pending.holdCallers(work);
  }

  /**
   * Schedule a task to happen once simulated time reaches an instant.
   */
  scheduleAt(dueTime: Date, task: BackgroundTask): void {
    this.dueTasks.add(dueTime, task);
  }

  /**
   * Give up on a task scheduled to happen at a simulated instant.
   */
  cancelScheduled(task: BackgroundTask): void {
    this.dueTasks.cancel(task);
  }

  /**
   * Say that the scheduled task running now is waiting on the clock.
   */
  waitingOnClock(): () => void {
    return this.pending.waitingOnClock();
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
   */
  public async complete(): Promise<void> {
    await this.pending.complete();
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
