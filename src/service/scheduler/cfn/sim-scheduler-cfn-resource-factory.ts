import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimScheduler } from "../sim-scheduler.js";
import {
  createdSchedule,
  refuseUnknownType,
} from "./sim-cfn-scheduler-resource-lookup.js";
import { SimCfnScheduleProperties } from "./sim-cfn-schedule-properties.js";
import { simCfnSchedulerResourceCreation } from "./sim-cfn-scheduler-resource-error.js";

interface SimSchedulerCfnResourceFactoryProperties {
  readonly scheduler: SimScheduler;
}

/**
 * CloudFormation Resource factory for simulated Scheduler resources.
 *
 * There is one type, and the schedule goes through the ordinary CreateSchedule
 * command rather than being constructed directly, so a schedule a template
 * deployed is the same thing an SDK caller would have got, down to the
 * refusals.
 */
export class SimSchedulerCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly scheduler: SimScheduler;

  constructor(properties: SimSchedulerCfnResourceFactoryProperties) {
    this.scheduler = properties.scheduler;
  }

  /**
   * Create a simulated schedule from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    refuseUnknownType(resourceTypeName);

    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
    const input = properties.scheduleInput();

    return await simCfnSchedulerResourceCreation(
      resource.logicalId,
      async () => {
        await this.scheduler.createSchedule({ input });

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
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    refuseUnknownType(resourceTypeName);

    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );

    await this.scheduler.deleteSchedule({
      input: {
        Name: properties.name(),
        GroupName: properties.scheduleInput().GroupName,
      },
    });
  }

  private read(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnScheduleProperties {
    return new SimCfnScheduleProperties({ resource, properties });
  }
}
