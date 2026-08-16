import { SimCloudWatchAlarm } from "../../../../cloudwatch/alarm/sim-cloudwatch-alarm.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimCloudWatchAlarmCfn } from "./sim-cloudwatch-alarm-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated CloudWatch Resource.
 */
export function cloudWatchValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::CloudWatch::Alarm" &&
    properties.simResource instanceof SimCloudWatchAlarm
  ) {
    return new SimCloudWatchAlarmCfn({ alarm: properties.simResource });
  }

  return undefined;
}
