import { isRecord } from "../../../util/type-guard/record.js";
import { SimCfnGeneratedResourceName } from "../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimSchedulerFlexibleTimeWindow,
  SimSchedulerRequestTarget,
  SimSchedulerScheduleInput,
} from "../command/schedule/schedule.command.js";
import {
  schedulerScheduleResourceType,
  simCfnSchedulerResourceError,
} from "./sim-cfn-scheduler-resource-error.js";

const maximumNameLength = 64;

/**
 * Reads AWS::Scheduler::Schedule properties into the shape CreateSchedule
 * takes.
 *
 * Nearly everything lines up one to one with the API, so this is mostly reading
 * and type checking. What it does not pass through is refused by simulated
 * Scheduler itself rather than here, which keeps one answer to what a schedule
 * may ask for however it was created.
 */
export class SimCfnScheduleProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * The schedule name.
   *
   * An unnamed schedule is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    const name = this.properties.get("Name");

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError("Name must be a string");
    }

    return name;
  }

  /**
   * Everything CreateSchedule takes, read out of the template.
   *
   * Dates arrive as strings in a template and as `Date` values through the SDK,
   * so they are read here into what the command expects. Simulated Scheduler
   * refuses both of them, and refusing a well-formed date is a better answer
   * than refusing it for being the wrong type.
   */
  scheduleInput(): SimSchedulerScheduleInput {
    return {
      Name: this.name(),
      GroupName: this.stringProperty("GroupName"),
      ScheduleExpression: this.stringProperty("ScheduleExpression"),
      ScheduleExpressionTimezone: this.stringProperty(
        "ScheduleExpressionTimezone",
      ),
      FlexibleTimeWindow: this.flexibleTimeWindow(),
      Target: this.target(),
      State: this.stringProperty("State"),
      Description: this.stringProperty("Description"),
      ActionAfterCompletion: this.stringProperty("ActionAfterCompletion"),
      StartDate: this.dateProperty("StartDate"),
      EndDate: this.dateProperty("EndDate"),
      KmsKeyArn: this.stringProperty("KmsKeyArn"),
    };
  }

  /**
   * The time window, which AWS requires on this Resource type.
   */
  private flexibleTimeWindow(): SimSchedulerFlexibleTimeWindow | undefined {
    const window = this.properties.get("FlexibleTimeWindow");

    if (window === undefined) {
      return undefined;
    }

    if (!isRecord(window)) {
      throw this.propertyError("FlexibleTimeWindow is an object");
    }

    return {
      Mode: typeof window["Mode"] === "string" ? window["Mode"] : undefined,
      MaximumWindowInMinutes:
        typeof window["MaximumWindowInMinutes"] === "number"
          ? window["MaximumWindowInMinutes"]
          : undefined,
    };
  }

  /**
   * The schedule's target, which AWS requires on this Resource type.
   *
   * Everything the target carries is handed to simulated Scheduler as it was
   * written, including the properties it refuses, so a template asking for a
   * dead letter queue is refused by the one place that knows it is unmodelled.
   */
  private target(): SimSchedulerRequestTarget | undefined {
    const target = this.properties.get("Target");

    if (target === undefined) {
      return undefined;
    }

    if (!isRecord(target)) {
      throw this.propertyError("Target is an object");
    }

    return target;
  }

  private dateProperty(name: string): Date | undefined {
    const value = this.stringProperty(name);

    return value === undefined ? undefined : new Date(value);
  }

  private stringProperty(name: string): string | undefined {
    const value = this.properties.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.propertyError(`${name} must be a string`);
    }

    return value;
  }

  private propertyError(reason: string): Error {
    return simCfnSchedulerResourceError(
      schedulerScheduleResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
