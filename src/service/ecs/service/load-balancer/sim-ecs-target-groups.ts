import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";

/**
 * One task of a service as a target group holds it.
 *
 * The address stands in for the task's own network interface address, which is
 * what real ECS registers for an `awsvpc` task, and the port is the one the
 * service's registration named.
 */
export interface SimEcsTaskTarget {
  readonly address: string;
  readonly port: number;
}

/**
 * One target group a service registers its tasks into.
 *
 * Registering goes straight to the target group rather than through
 * `RegisterTargets`, because nothing here is making the request: real ECS
 * registers a task through its service-linked role, which is not something a
 * test creates or could take away, so there is no caller for simulated IAM to
 * decide about.
 */
export interface SimEcsRegistrableTargetGroup {
  /** What the target group holds, which has to be addresses. */
  readonly targetType: string;

  register(target: SimEcsTaskTarget): void;

  deregister(target: SimEcsTaskTarget): void;
}

/**
 * Where a simulated ECS service's tasks are registered as load balancer
 * targets.
 *
 * A target group is looked for when a service is created and again as each of
 * its tasks starts and stops, rather than held from the first of those, because
 * a target group is a resource of its own that something else may have deleted
 * in between.
 */
export interface SimEcsTargetGroups {
  find(targetGroupArn: string): SimEcsRegistrableTargetGroup | undefined;
}

/**
 * The target groups a simulated ECS built on its own can reach, which is none.
 *
 * Simulated ECS is usually built through a SimAws instance, which hands it that
 * simulation's ELBv2. One built by itself has none to reach, so a service
 * declaring a load balancer says so rather than being created with a
 * registration that could never carry a request.
 */
export class SimEcsUnreachableTargetGroups implements SimEcsTargetGroups {
  find(targetGroupArn: string): SimEcsRegistrableTargetGroup | undefined {
    throw new SimEcsInvalidParameterException(
      `${targetGroupArn} cannot be registered into, because this simulated ` +
        `ECS reaches no simulated Elastic Load Balancing. Build it through a ` +
        `SimAws instance to register a service with a target group.`,
    );
  }
}
