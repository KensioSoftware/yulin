import { SimCloudWatchAlarm } from "../../alarm/sim-cloudwatch-alarm.js";
import { SimCloudWatchMissingRequiredParameterException } from "../../error/sim-cloudwatch.error.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type { SimCloudWatchAlarmContext } from "./sim-cloudwatch-alarm-context.js";
import type {
  SimDeleteAlarmsCommand,
  SimDeleteAlarmsCommandOutput,
  SimPutMetricAlarmCommand,
  SimPutMetricAlarmCommandOutput,
} from "./alarm.command.js";
import { readSimCloudWatchAlarmDefinition } from "./sim-cloudwatch-alarm-input.js";

const putMetricAlarmAction = "cloudwatch:PutMetricAlarm";
const deleteAlarmsAction = "cloudwatch:DeleteAlarms";

/**
 * The commands that create and remove alarms.
 */
export class SimCloudWatchAlarmWrites {
  readonly #context: SimCloudWatchAlarmContext;

  constructor(context: SimCloudWatchAlarmContext) {
    this.#context = context;
  }

  /**
   * Create an alarm, or take a new configuration for one that exists.
   *
   * An existing alarm keeps its state and history across the change, as it
   * does on real CloudWatch: an alarm in ALARM stays there until it next
   * evaluates against whatever it now watches.
   */
  putMetricAlarm(
    command: SimPutMetricAlarmCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimPutMetricAlarmCommandOutput {
    const definition = readSimCloudWatchAlarmDefinition(command.input);

    this.#context.authorizer.authorizeAlarm(
      putMetricAlarmAction,
      definition.alarmName,
      options?.caller,
    );

    const now = this.#context.clock.now();
    const existing = this.#context.alarms.find(definition.alarmName);

    if (existing === undefined) {
      const alarm = new SimCloudWatchAlarm({
        definition,
        accountRegionScope: this.#context.accountRegionScope,
        createdAt: now,
      });

      this.#context.alarms.put(alarm);
      this.#context.schedule.start(alarm);
    } else {
      existing.redefine(definition, now);
      this.#context.schedule.start(existing);
    }

    return { $metadata: {} };
  }

  /**
   * Remove alarms, and stop evaluating them.
   */
  deleteAlarms(
    command: SimDeleteAlarmsCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimDeleteAlarmsCommandOutput {
    const names = requiredAlarmNames(command.input.AlarmNames);

    for (const alarmName of names) {
      this.#context.authorizer.authorizeAlarm(
        deleteAlarmsAction,
        alarmName,
        options?.caller,
      );
    }

    for (const alarmName of names) {
      this.#context.schedule.stop(alarmName);
      this.#context.alarms.delete(alarmName);
    }

    return { $metadata: {} };
  }
}

function requiredAlarmNames(
  alarmNames: readonly string[] | undefined,
): readonly string[] {
  if (alarmNames === undefined || alarmNames.length === 0) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter AlarmNames must be present and not empty.",
    );
  }

  return alarmNames.map((alarmName) =>
    requiredSimCloudWatchName("AlarmNames", alarmName),
  );
}
