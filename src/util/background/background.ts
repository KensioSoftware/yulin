/* oxlint-disable unicorn-js/prefer-await  */

import { setTimeout } from "node:timers";
import { type SimClock, SimRealClock } from "../clock/sim-clock.js";
import { BackgroundPendingTasks } from "./background-pending-tasks.js";
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
   * Count work a caller started as outstanding until it settles.
   *
   * Completion then waits for it, so a simulation asked to settle takes in
   * work a caller is holding the promise of as well as work it was handed.
   * Whoever asked for it still gets what it settles with, failure included.
   *
   * Work already running as a scheduled task is counted where it is, and this
   * simply runs it.
   */
  outstanding<T>(work: () => Promise<T>): Promise<T>;

  /**
   * Run a task that is already due, and keep it outstanding until it settles.
   *
   * Started here and now rather than deferred to a host timer, because
   * advancing the clock steps through every instant work falls due at and a
   * timer for each of them would cost real time. It is counted as outstanding
   * work all the same, so a task that goes on to wait for the clock stops
   * holding up whatever is moving it.
   */
  runDue(task: BackgroundTask): void;

  /**
   * Schedule a task to happen once simulated time reaches an instant.
   *
   * Nothing dispatches it until the clock gets there, so scheduled work
   * happens on the simulation's timeline rather than the host's.
   */
  scheduleAt(dueTime: Date, task: BackgroundTask): void;

  /**
   * Give up on a task scheduled to happen once simulated time reaches an
   * instant.
   *
   * Something that polls schedules its next turn on the clock, so whatever
   * stops it takes that turn back off. A task that was never scheduled, or has
   * already run, is nothing to give up on.
   */
  cancelScheduled(task: BackgroundTask): void;

  /**
   * Say that the scheduled task running now is waiting for simulated time to
   * reach an instant, and get back the way to say it no longer is.
   *
   * Completion stops waiting for the task while it waits here, because moving
   * the clock is the only thing that releases it and completion is what
   * moving the clock waits for. Called from outside a scheduled task, such as
   * from work a caller is holding the promise of, this changes nothing.
   */
  waitingOnClock(): () => void;
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
  private readonly pending = new BackgroundPendingTasks();
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
    this.pending.hold(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

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
   *
   * Work waiting on the clock is not waited for: it is not outstanding, it is
   * scheduled for a simulated instant that has not arrived. Only moving the
   * clock releases it.
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
