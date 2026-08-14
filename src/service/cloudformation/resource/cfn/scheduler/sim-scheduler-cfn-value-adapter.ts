import { SimSchedulerSchedule } from "../../../../scheduler/schedule/sim-scheduler-schedule.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type {
  SimCfnResourceValueAdapter,
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing values for a simulated schedule.
 */
class SimSchedulerScheduleCfn implements SimCfnResourceValueAdapter {
  private readonly schedule: SimSchedulerSchedule;

  constructor(properties: { readonly schedule: SimSchedulerSchedule }) {
    this.schedule = properties.schedule;
  }

  /**
   * AWS::Scheduler::Schedule Ref returns the schedule's name.
   */
  refValue(): SimCfnTemplateValue {
    return this.schedule.name.value;
  }

  /**
   * AWS::Scheduler::Schedule attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.schedule.arn;
    }

    throw new Error(
      `Unsupported AWS::Scheduler::Schedule attribute ${attributeName}`,
    );
  }
}

/**
 * The CloudFormation-facing value adapter for a simulated Scheduler Resource.
 */
export function schedulerValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Scheduler::Schedule" &&
    properties.simResource instanceof SimSchedulerSchedule
  ) {
    return new SimSchedulerScheduleCfn({ schedule: properties.simResource });
  }

  return undefined;
}
