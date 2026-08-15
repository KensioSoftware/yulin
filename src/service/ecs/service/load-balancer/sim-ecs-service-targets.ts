import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsTask } from "../../task/sim-ecs-task.js";
import type { SimEcsService } from "../sim-ecs-service.js";
import type { SimEcsServiceRegistration } from "./sim-ecs-service-registration.js";
import { SimEcsTaskAddresses } from "./sim-ecs-task-addresses.js";
import type { SimEcsTargetGroups } from "./sim-ecs-target-groups.js";

/**
 * The target type a service's tasks are registered as.
 *
 * Real ECS registers an `awsvpc` task by the address of its network interface,
 * which is an `ip` target. A target group of any other type is refused when the
 * service is created, as real ECS refuses one.
 */
const registeredTargetType = "ip";

interface SimEcsServiceTargetsProperties {
  readonly targetGroups: SimEcsTargetGroups;
}

/**
 * Registers the tasks of the services in one simulated ECS scope as load
 * balancer targets.
 *
 * A task is a target from the moment the service starts it until the moment it
 * stops, which is what makes a service scaled to nothing, or deleted, leave a
 * target group with nothing in it to answer for. Registration is immediate at
 * both ends: real ECS waits for a health check before a new task takes traffic
 * and drains connections before an old one goes, and neither of those exists
 * here.
 *
 * The address a task is registered under is held here rather than on the task,
 * because it is the load balancer's way of naming a task rather than anything
 * ECS reports about one.
 */
export class SimEcsServiceTargets {
  private readonly targetGroups: SimEcsTargetGroups;
  private readonly addresses = new SimEcsTaskAddresses();
  private readonly registered = new Map<string, string>();

  constructor(properties: SimEcsServiceTargetsProperties) {
    this.targetGroups = properties.targetGroups;
  }

  /**
   * Refuse the registrations a service could not be created with.
   *
   * This is what a target group that is not there, or that holds something
   * other than addresses, is reported by. Real ECS refuses `CreateService` for
   * both, and refusing here is what stops a service being created registered
   * with something that could never carry it a request.
   */
  requireRegistrable(
    registrations: readonly SimEcsServiceRegistration[],
  ): void {
    for (const registration of registrations) {
      this.requireRegistrableGroup(registration);
    }
  }

  /**
   * Register a task the service has started into every target group it named.
   */
  register(service: SimEcsService, task: SimEcsTask): void {
    const { registrations } = service;

    if (registrations.length === 0) {
      return;
    }

    const address = this.addresses.take();

    this.registered.set(task.taskArn, address);

    for (const registration of registrations) {
      this.targetGroups
        .find(registration.targetGroupArn)
        ?.register({ address, port: registration.containerPort });
    }
  }

  /**
   * Take the tasks a service has stopped out of every target group it named.
   */
  deregisterAll(service: SimEcsService, tasks: readonly SimEcsTask[]): void {
    for (const task of tasks) {
      this.deregister(service, task);
    }
  }

  /**
   * Take one stopped task out of every target group the service named.
   *
   * A target group something else has deleted in the meantime is left alone
   * rather than reported, since the targets went with it and there is nothing
   * a stopping task could do about it.
   */
  private deregister(service: SimEcsService, task: SimEcsTask): void {
    const address = this.registered.get(task.taskArn);

    if (address === undefined) {
      return;
    }

    this.registered.delete(task.taskArn);

    for (const registration of service.registrations) {
      this.targetGroups
        .find(registration.targetGroupArn)
        ?.deregister({ address, port: registration.containerPort });
    }
  }

  private requireRegistrableGroup(
    registration: SimEcsServiceRegistration,
  ): void {
    const targetGroup = this.targetGroups.find(registration.targetGroupArn);

    if (targetGroup === undefined) {
      throw new SimEcsInvalidParameterException(
        `${registration.targetGroupArn} names no simulated target group, so ` +
          `the service has nothing to register its tasks into.`,
      );
    }

    if (targetGroup.targetType !== registeredTargetType) {
      throw new SimEcsInvalidParameterException(
        `${registration.targetGroupArn} holds ${targetGroup.targetType} ` +
          `targets. A service registers its tasks by address, so it needs a ` +
          `target group of the ${registeredTargetType} type.`,
      );
    }
  }
}
