import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../util/background/background.js";
import type { SimCloudWatchMetricStore } from "../metric/sim-cloudwatch-metric-store.js";
import type { SimCloudWatchAlarmActions } from "./action/sim-cloudwatch-alarm-actions.js";
import type { SimCloudWatchAlarm } from "./sim-cloudwatch-alarm.js";
import { evaluateSimCloudWatchAlarm } from "./sim-cloudwatch-alarm-evaluation.js";
import {
  simCloudWatchAlarmPeriods,
  simCloudWatchNextPeriodBoundary,
} from "./sim-cloudwatch-alarm-periods.js";

interface SimCloudWatchAlarmScheduleProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly actions: SimCloudWatchAlarmActions;
  readonly background: BackgroundScheduler;
}

/**
 * Runs each alarm's evaluation on the simulation's clock.
 *
 * Nothing here uses a real timer. An alarm's next evaluation is scheduled on
 * the background scheduler at the next period boundary, and every evaluation
 * schedules the one after it, so a frozen clock evaluates nothing and
 * `advanceBy({ minutes: 20 })` walks twenty one-minute evaluations and settles
 * before the call returns.
 *
 * Each alarm keeps one task for its whole life, because taking a scheduled
 * turn back off the clock is done by task identity: a fresh closure per
 * evaluation could be scheduled but never cancelled.
 */
export class SimCloudWatchAlarmSchedule {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #actions: SimCloudWatchAlarmActions;
  readonly #background: BackgroundScheduler;
  readonly #tasks = new Map<string, BackgroundTask>();

  constructor(properties: SimCloudWatchAlarmScheduleProperties) {
    this.#metrics = properties.metrics;
    this.#actions = properties.actions;
    this.#background = properties.background;
  }

  /**
   * Start evaluating an alarm, from the next period boundary.
   *
   * An alarm already being evaluated keeps its existing turn rather than
   * gaining a second one, which is what makes PutMetricAlarm over an existing
   * name safe to call repeatedly.
   */
  start(alarm: SimCloudWatchAlarm): void {
    if (this.#tasks.has(alarm.name)) {
      return;
    }

    const task = async (): Promise<void> => {
      await this.evaluate(alarm);
    };

    this.#tasks.set(alarm.name, task);
    this.scheduleNext(alarm, task);
  }

  /**
   * Stop evaluating an alarm and take its scheduled turn back off the clock.
   *
   * Without this a deleted alarm would keep waking up, keep reading a metric
   * nothing watches, and keep the simulation from settling.
   */
  stop(alarmName: string): void {
    const task = this.#tasks.get(alarmName);

    if (task === undefined) {
      return;
    }

    this.#tasks.delete(alarmName);
    this.#background.cancelScheduled(task);
  }

  /**
   * Evaluate an alarm against the periods behind it, then schedule the next
   * turn.
   *
   * The clock reads the boundary this turn was due at while this runs, so a
   * transition is stamped with when it happened rather than with wherever time
   * was eventually advanced to.
   */
  private async evaluate(alarm: SimCloudWatchAlarm): Promise<void> {
    const task = this.#tasks.get(alarm.name);

    if (task === undefined) {
      return;
    }

    const now = this.#background.now();
    const evaluation = evaluateSimCloudWatchAlarm(
      simCloudWatchAlarmPeriods(this.#metrics, alarm.definition, now),
      alarm.definition,
    );
    const transition =
      evaluation.state === undefined
        ? undefined
        : alarm.moveTo(evaluation.state, evaluation.reason, now);

    this.scheduleNext(alarm, task);

    if (transition !== undefined) {
      await this.#actions.fire(alarm, transition);
    }
  }

  private scheduleNext(alarm: SimCloudWatchAlarm, task: BackgroundTask): void {
    this.#background.scheduleAt(
      simCloudWatchNextPeriodBoundary(
        this.#background.now(),
        alarm.definition.period,
      ),
      task,
    );
  }
}
