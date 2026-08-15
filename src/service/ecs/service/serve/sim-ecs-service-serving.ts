import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import { SimEcsContainerEnvironments } from "../../task/run/sim-ecs-container-environments.js";
import { SimEcsTaskOverrides } from "../../task/run/sim-ecs-task-overrides.js";
import type { SimEcsStartingServiceContainer } from "../run/sim-ecs-service-consumption.js";
import { SimEcsContainerServer } from "./sim-ecs-container-server.js";
import type { SimEcsServiceServers } from "./sim-ecs-service-servers.js";

interface SimEcsServiceServingProperties {
  readonly servers: SimEcsServiceServers;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly regionName: string;
}

/**
 * Takes on the containers of a service that answer requests, as its tasks come
 * up.
 *
 * A container bound to an HTTP handler starts nothing of its own, unlike one
 * that consumes a queue: what reaches it is a request a load balancer routes to
 * the target group its service registered into. What has to happen as a task
 * comes up is only that the container becomes reachable, with the environment
 * the task's secrets have just resolved to, so a served request reads the same
 * variables a run task's container would.
 */
export class SimEcsServiceServing {
  private readonly servers: SimEcsServiceServers;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly environments: SimEcsContainerEnvironments;

  constructor(properties: SimEcsServiceServingProperties) {
    this.servers = properties.servers;
    this.runAsOwner = properties.runAsOwner;
    this.environments = new SimEcsContainerEnvironments({
      regionName: properties.regionName,
      overrides: new SimEcsTaskOverrides(undefined),
    });
  }

  /**
   * Have this container answer for its service, if it serves requests.
   */
  begin(starting: SimEcsStartingServiceContainer): void {
    const { serves } = starting.bound;

    if (serves === undefined) {
      return;
    }

    const { service, taskDefinition } = starting.deployment;
    const { declared } = starting;
    const environment = this.environments.for(
      declared,
      starting.secrets.forContainer(declared.name),
    );

    this.servers.ensure(
      service,
      new SimEcsContainerServer({
        declared,
        handler: serves,
        environment,
        taskRoleArn: taskDefinition.settings.taskRoleArn,
        runAsOwner: this.runAsOwner,
      }),
    );
  }
}
