import type { SimAws } from "../../aws/sim-aws.js";
import type { SimSchedulerTargetService } from "../target/sim-scheduler-target-arn.js";
import type {
  SimSchedulerAssumedDelivery,
  SimSchedulerDeadLetterRequest,
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
} from "./sim-scheduler-delivery.js";
import { SimSchedulerDeliveryFunction } from "./sim-scheduler-delivery-function.js";
import { SimAwsSchedulerDeadLetters } from "./sim-aws-scheduler-dead-letters.js";
import { SimSchedulerDeliveryQueue } from "./sim-scheduler-delivery-queue.js";
import { SimSchedulerDeliveryTask } from "./sim-scheduler-delivery-task.js";
import { SimSchedulerDeliveryTopic } from "./sim-scheduler-delivery-topic.js";
import {
  assumeSchedulerExecutionRole,
  schedulerExecutionRoleTarget,
} from "./sim-scheduler-execution-role.js";

interface SimAwsSchedulerDeliveryTargetsProperties {
  readonly simAws: SimAws;
}

/**
 * Everywhere the schedules of one simulated AWS instance can invoke.
 *
 * The target is looked up when a schedule fires, never when this is built:
 * reaching another service while this one is being constructed is a cycle with
 * no bottom to it.
 *
 * A target in another Account or Region is allowed, since real Scheduler
 * invokes across both, and it is the target's own Account that evaluates
 * whether the execution role may.
 */
export class SimAwsSchedulerDeliveryTargets implements SimSchedulerDeliveryTargets {
  private readonly simAws: SimAws;
  private readonly deadLetters: SimAwsSchedulerDeadLetters;

  constructor(properties: SimAwsSchedulerDeliveryTargetsProperties) {
    this.simAws = properties.simAws;
    this.deadLetters = new SimAwsSchedulerDeadLetters(properties);
  }

  /**
   * Assume the schedule's execution role, then invoke its target as that role.
   *
   * The role is assumed in its own Account, and the target is reached in the
   * target's, which are not necessarily the same one.
   */
  async deliver(request: SimSchedulerDeliveryRequest): Promise<void> {
    const arn = request.schedule.target.arn;
    const role = schedulerExecutionRoleTarget(request.schedule.target.roleArn);
    const roleScope = this.simAws.accountRegionScope(
      role.accountId,
      arn.regionName,
    );

    const caller = await assumeSchedulerExecutionRole(
      role,
      roleScope,
      request.schedule,
    );

    await this.invoke(arn.service, { request, caller });
  }

  /**
   * Send an exhausted or permanent failure to the configured queue.
   */
  async deadLetter(deadLetter: SimSchedulerDeadLetterRequest): Promise<void> {
    await this.deadLetters.deliver(deadLetter);
  }

  /**
   * Hand the invocation to the one destination that knows this service.
   */
  private async invoke(
    service: SimSchedulerTargetService,
    delivery: SimSchedulerAssumedDelivery,
  ): Promise<void> {
    const arn = delivery.request.schedule.target.arn;
    const scope = this.simAws.accountRegionScope(arn.accountId, arn.regionName);

    switch (service) {
      case "lambda": {
        await new SimSchedulerDeliveryFunction({ scope }).deliver(delivery);
        return;
      }
      case "sqs": {
        await new SimSchedulerDeliveryQueue({ scope }).deliver(delivery);
        return;
      }
      case "sns": {
        await new SimSchedulerDeliveryTopic({ scope }).deliver(delivery);
        return;
      }
      case "ecs": {
        await new SimSchedulerDeliveryTask({ scope }).deliver(delivery);
        return;
      }
    }
  }
}
