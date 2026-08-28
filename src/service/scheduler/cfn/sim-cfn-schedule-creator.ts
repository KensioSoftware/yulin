import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSchedulerSchedule } from "../schedule/sim-scheduler-schedule.js";
import type { SimScheduler } from "../sim-scheduler.js";
import { SimCfnScheduleProperties } from "./sim-cfn-schedule-properties.js";
import { createdSchedule } from "./sim-cfn-scheduler-resource-lookup.js";
import {
  schedulerScheduleResourceType,
  simCfnSchedulerResourceCreation,
  simCfnSchedulerResourceDeletion,
} from "./sim-cfn-scheduler-resource-error.js";

/**
 * Creates simulated schedules from AWS::Scheduler::Schedule Resources.
 *
 * The schedule goes through the ordinary CreateSchedule command rather than
 * being constructed directly, so a schedule a template deployed is the same
 * thing an SDK caller would have got, down to the refusals.
 */
export class SimCfnScheduleCreator {
  private readonly scheduler: SimScheduler;

  constructor(properties: { readonly scheduler: SimScheduler }) {
    this.scheduler = properties.scheduler;
  }

  /**
   * Create a schedule from an AWS::Scheduler::Schedule Resource.
   */
  async create(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimSchedulerSchedule> {
    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
    const input = properties.scheduleInput();

    return await simCfnSchedulerResourceCreation(
      schedulerScheduleResourceType,
      resource.logicalId,
      async () => {
        await this.scheduler.createSchedule(
          { input },
          simCfnResourceCallerOptions(context.caller),
        );

        const schedule = createdSchedule(this.scheduler, input);

        assertDefined(
          schedule,
          `sim Scheduler schedule ${String(input.Name)} after ` +
            `CloudFormation creation`,
        );

        return schedule;
      },
    );
  }

  /**
   * Delete the schedule a Resource created.
   */
  async delete(
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );

    await simCfnSchedulerResourceDeletion(async () => {
      await this.scheduler.deleteSchedule(
        {
          input: {
            Name: properties.name(),
            GroupName: properties.scheduleInput().GroupName,
          },
        },
        simCfnResourceCallerOptions(context.caller),
      );
    });
  }

  private read(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnScheduleProperties {
    return new SimCfnScheduleProperties({ resource, properties });
  }
}
