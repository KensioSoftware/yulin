import type { SimCloudWatchAlarm } from "./sim-cloudwatch-alarm.js";

/**
 * The alarms of one simulated CloudWatch scope.
 *
 * Alarms are keyed by name, which is the whole of their identity: a name is
 * unique within one account and region, and it is what the ARN carries.
 */
export class SimCloudWatchAlarmStore {
  readonly #alarms = new Map<string, SimCloudWatchAlarm>();

  /**
   * Every alarm in this scope, in the order each was created.
   */
  get all(): readonly SimCloudWatchAlarm[] {
    return this.#alarms.values().toArray();
  }

  find(alarmName: string): SimCloudWatchAlarm | undefined {
    return this.#alarms.get(alarmName);
  }

  put(alarm: SimCloudWatchAlarm): void {
    this.#alarms.set(alarm.name, alarm);
  }

  /**
   * Remove an alarm, answering with it if it was there.
   *
   * Real DeleteAlarms says nothing about a name that is not there, so the
   * caller decides what to make of it.
   */
  delete(alarmName: string): SimCloudWatchAlarm | undefined {
    const alarm = this.#alarms.get(alarmName);

    this.#alarms.delete(alarmName);

    return alarm;
  }
}
