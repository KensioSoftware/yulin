import type { SimEcsBoundContainer } from "../../bind/sim-ecs-bound-container.js";
import type { SimEcsContainerDefinition } from "../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsContainerEnvironment } from "../../task/run/sim-ecs-container-environment.js";
import { SimEcsContainerEnvironments } from "../../task/run/sim-ecs-container-environments.js";
import { SimEcsTaskOverrides } from "../../task/run/sim-ecs-task-overrides.js";
import type { SimEcsResolvedSecrets } from "../../task/run/secret/sim-ecs-resolved-secrets.js";
import type { SimEcsServiceConsumers } from "../consume/sim-ecs-service-consumers.js";
import type { SimEcsServiceDeployment } from "./sim-ecs-service-deployment.js";

/**
 * One container of a service's task, as it comes up.
 */
export interface SimEcsStartingServiceContainer {
  readonly deployment: SimEcsServiceDeployment;
  readonly declared: SimEcsContainerDefinition;
  readonly bound: SimEcsBoundContainer;
  readonly secrets: SimEcsResolvedSecrets;
}

interface SimEcsServiceConsumptionProperties {
  readonly consumers: SimEcsServiceConsumers;
  readonly regionName: string;
}

/**
 * Starts the queue polling a service's containers do, as its tasks come up.
 *
 * A container bound to consume a queue is the one kind that does something on
 * its own once a service is running, so it is the one kind that has anything to
 * start here. Everything else about a service container is a record that it is
 * up.
 *
 * The container's environment is built from what the task's secrets resolved to
 * a moment ago, so a handler polling a queue reads the same variables one run
 * by `RunTask` would. There is no override, because nothing overrode anything:
 * a service starts its own tasks rather than being asked to start one.
 */
export class SimEcsServiceConsumption {
  private readonly consumers: SimEcsServiceConsumers;
  private readonly environments: SimEcsContainerEnvironments;

  constructor(properties: SimEcsServiceConsumptionProperties) {
    this.consumers = properties.consumers;
    this.environments = new SimEcsContainerEnvironments({
      regionName: properties.regionName,
      overrides: new SimEcsTaskOverrides(undefined),
    });
  }

  /**
   * Have this container's queue polled for, if it consumes one.
   *
   * Every task of the service reaches this as it starts, and the polling is
   * kept per service and container rather than per task, so the second task
   * finds the first task's poller rather than adding another.
   */
  begin(starting: SimEcsStartingServiceContainer): void {
    const { consumes } = starting.bound;

    if (consumes === undefined) {
      return;
    }

    const { service, taskDefinition } = starting.deployment;

    this.consumers.ensure({
      clusterName: service.clusterName,
      serviceName: service.serviceName,
      containerName: starting.declared.name,
      consumes,
      environment: this.environmentFor(starting),
      taskRoleArn: taskDefinition.settings.taskRoleArn,
    });
  }

  private environmentFor(
    starting: SimEcsStartingServiceContainer,
  ): SimEcsContainerEnvironment {
    const { declared } = starting;

    return this.environments.for(
      declared,
      starting.secrets.forContainer(declared.name),
    );
  }
}
