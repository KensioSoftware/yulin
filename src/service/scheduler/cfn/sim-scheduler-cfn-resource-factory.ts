import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimScheduler } from "../sim-scheduler.js";
import { SimCfnScheduleCreator } from "./sim-cfn-schedule-creator.js";
import { SimCfnScheduleGroupCreator } from "./sim-cfn-schedule-group-creator.js";
import { schedulerResourceTypeName } from "./sim-cfn-scheduler-resource-lookup.js";

interface SimSchedulerCfnResourceFactoryProperties {
  readonly scheduler: SimScheduler;
}

/**
 * CloudFormation Resource factory for simulated Scheduler resources.
 *
 * Two types, a schedule and the group it goes in, both created through the
 * ordinary Scheduler commands rather than constructed directly.
 */
export class SimSchedulerCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly scheduleCreator: SimCfnScheduleCreator;
  private readonly groupCreator: SimCfnScheduleGroupCreator;

  constructor(properties: SimSchedulerCfnResourceFactoryProperties) {
    this.scheduleCreator = new SimCfnScheduleCreator(properties);
    this.groupCreator = new SimCfnScheduleGroupCreator(properties);
  }

  /**
   * Create a simulated Scheduler resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    if (schedulerResourceTypeName(resourceTypeName) === "ScheduleGroup") {
      return await this.groupCreator.create(resource, context);
    }

    return await this.scheduleCreator.create(resource, context);
  }

  /**
   * Delete the resource a Resource created.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    if (schedulerResourceTypeName(resourceTypeName) === "ScheduleGroup") {
      await this.groupCreator.delete(resource, context);

      return;
    }

    await this.scheduleCreator.delete(resource, context);
  }
}
