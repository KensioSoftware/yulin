import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudWatchAlarm } from "../../alarm/sim-cloudwatch-alarm.js";
import type { SimCloudWatch } from "../../sim-cloudwatch.js";
import { SimCfnAlarmProperties } from "./sim-cfn-alarm-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnAlarmCreatorProperties {
  readonly cloudWatch: SimCloudWatch;
}

/**
 * Creates simulated alarms from AWS::CloudWatch::Alarm Resources.
 *
 * The alarm is created through the ordinary PutMetricAlarm command rather than
 * constructed directly, so an alarm a template deployed is the same thing an
 * SDK caller would have got: the same validation, the same refusals, and the
 * same clock-driven evaluation from the next period boundary.
 */
export class SimCfnAlarmCreator {
  readonly #cloudWatch: SimCloudWatch;

  constructor(properties: SimCfnAlarmCreatorProperties) {
    this.#cloudWatch = properties.cloudWatch;
  }

  /**
   * Create an alarm from an AWS::CloudWatch::Alarm Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimCloudWatchAlarm> {
    const alarmProperties = new SimCfnAlarmProperties({ resource, properties });
    const alarmName = alarmProperties.alarmName();

    alarmProperties.recordIgnoredProperties();

    await this.#cloudWatch.putMetricAlarm(
      { input: alarmProperties.input() },
      options,
    );

    const alarm = this.#cloudWatch.findAlarm(alarmName);

    assertDefined(
      alarm,
      `sim CloudWatch alarm ${alarmName} after CloudFormation creation`,
    );

    return alarm;
  }

  /**
   * Delete an alarm created from an AWS::CloudWatch::Alarm Resource.
   *
   * DeleteAlarms takes its scheduled evaluation back off the clock as well as
   * removing it, which is what lets a torn-down stack settle rather than
   * leaving an alarm waking up to read a metric nothing watches.
   */
  async delete(
    alarm: SimCloudWatchAlarm,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#cloudWatch.deleteAlarms(
      { input: { AlarmNames: [alarm.name] } },
      options,
    );
  }
}
