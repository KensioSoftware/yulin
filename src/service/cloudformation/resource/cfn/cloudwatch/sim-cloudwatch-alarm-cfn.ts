import type { SimCloudWatchAlarm } from "../../../../cloudwatch/alarm/sim-cloudwatch-alarm.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudWatchAlarmCfnProperties {
  readonly alarm: SimCloudWatchAlarm;
}

/**
 * CloudFormation-facing values for a simulated CloudWatch alarm.
 */
export class SimCloudWatchAlarmCfn implements SimCfnResourceValueAdapter {
  readonly #alarm: SimCloudWatchAlarm;

  constructor(properties: SimCloudWatchAlarmCfnProperties) {
    this.#alarm = properties.alarm;
  }

  /**
   * AWS::CloudWatch::Alarm Ref returns the alarm name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#alarm.name;
  }

  /**
   * AWS::CloudWatch::Alarm attributes.
   *
   * `Arn` is the only one the Resource publishes, and it is the form an SNS
   * topic policy names when it grants CloudWatch permission to publish.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.#alarm.arn;
    }

    throw new Error(
      `Unsupported AWS::CloudWatch::Alarm attribute ${attributeName}`,
    );
  }
}
