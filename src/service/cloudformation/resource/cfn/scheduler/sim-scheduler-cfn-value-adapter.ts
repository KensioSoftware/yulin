import { SimSchedulerScheduleGroup } from "../../../../scheduler/group/sim-scheduler-schedule-group.js";
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
 * CloudFormation-facing values for a simulated schedule group.
 *
 * `Arn` is the one worth having. An identity policy granting `scheduler:`
 * actions on the group names it, and so does the `aws:SourceArn` condition AWS
 * recommends in a schedule execution role's trust policy.
 */
class SimSchedulerScheduleGroupCfn implements SimCfnResourceValueAdapter {
  private readonly group: SimSchedulerScheduleGroup;

  constructor(properties: { readonly group: SimSchedulerScheduleGroup }) {
    this.group = properties.group;
  }

  /**
   * AWS::Scheduler::ScheduleGroup Ref returns the group's name.
   */
  refValue(): SimCfnTemplateValue {
    return this.group.name;
  }

  /**
   * AWS::Scheduler::ScheduleGroup attributes.
   *
   * The two dates come back as ISO strings. A template value is JSON, so there
   * is nowhere for a `Date` to go, and every other date CloudFormation hands
   * back is a string too.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.group.arn;
      }
      case "State": {
        return this.group.state;
      }
      case "CreationDate": {
        return this.group.creationDate.toISOString();
      }
      case "LastModificationDate": {
        return this.group.lastModificationDate.toISOString();
      }
      default: {
        throw new Error(
          `Unsupported AWS::Scheduler::ScheduleGroup attribute ${attributeName}`,
        );
      }
    }
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

  if (
    properties.type === "AWS::Scheduler::ScheduleGroup" &&
    properties.simResource instanceof SimSchedulerScheduleGroup
  ) {
    return new SimSchedulerScheduleGroupCfn({ group: properties.simResource });
  }

  return undefined;
}
