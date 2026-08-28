import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSchedulerScheduleGroup } from "../group/sim-scheduler-schedule-group.js";
import type { SimScheduler } from "../sim-scheduler.js";
import { SimCfnScheduleGroupProperties } from "./sim-cfn-schedule-group-properties.js";
import {
  schedulerScheduleGroupResourceType,
  simCfnSchedulerResourceCreation,
  simCfnSchedulerResourceDeletion,
} from "./sim-cfn-scheduler-resource-error.js";

/**
 * Creates simulated schedule groups from AWS::Scheduler::ScheduleGroup
 * Resources.
 *
 * A group is worth deploying for one reason. A schedule's name is unique
 * within its group, and a construct deployed twice into one Account and Region
 * collides on schedule names unless each deployment brings its own group.
 */
export class SimCfnScheduleGroupCreator {
  private readonly scheduler: SimScheduler;

  constructor(properties: { readonly scheduler: SimScheduler }) {
    this.scheduler = properties.scheduler;
  }

  /**
   * Create a group from an AWS::Scheduler::ScheduleGroup Resource.
   */
  async create(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimSchedulerScheduleGroup> {
    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
    const name = properties.name();

    properties.recordIgnoredProperties();

    return await simCfnSchedulerResourceCreation(
      schedulerScheduleGroupResourceType,
      resource.logicalId,
      async () => {
        await this.scheduler.createScheduleGroup(
          { input: { Name: name } },
          simCfnResourceCallerOptions(context.caller),
        );

        const group = this.scheduler.findScheduleGroup(name);

        assertDefined(
          group,
          `sim Scheduler schedule group ${name} after CloudFormation creation`,
        );

        return group;
      },
    );
  }

  /**
   * Delete the group a Resource created, and the schedules still in it.
   *
   * Real Scheduler deletes a group's schedules with it, so a stack whose
   * schedules come down alongside their group has nothing left over either
   * way.
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
      await this.scheduler.deleteScheduleGroup(
        { input: { Name: properties.name() } },
        simCfnResourceCallerOptions(context.caller),
      );
    });
  }

  private read(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnScheduleGroupProperties {
    return new SimCfnScheduleGroupProperties({ resource, properties });
  }
}
