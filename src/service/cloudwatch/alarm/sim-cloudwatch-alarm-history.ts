import type { SimCloudWatchAlarmState } from "./sim-cloudwatch-alarm-state.js";

/**
 * One thing that happened to an alarm.
 *
 * Only state changes are recorded. Real CloudWatch also records configuration
 * updates and action invocations, and those say nothing a test could not read
 * off the alarm itself, so the history here is the transitions.
 */
export interface SimCloudWatchAlarmHistoryItem {
  readonly timestamp: Date;
  readonly previousState: SimCloudWatchAlarmState;
  readonly state: SimCloudWatchAlarmState;
  readonly reason: string;
}

/**
 * The state changes of one alarm, newest first.
 *
 * Newest first is how real DescribeAlarmHistory answers, and it is what a test
 * asserting on the last transition wants to read.
 */
export class SimCloudWatchAlarmHistory {
  readonly #items: SimCloudWatchAlarmHistoryItem[] = [];

  get all(): readonly SimCloudWatchAlarmHistoryItem[] {
    return this.#items;
  }

  record(item: SimCloudWatchAlarmHistoryItem): void {
    this.#items.unshift(item);
  }
}
