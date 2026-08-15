import type { SimEcsServiceRegistration } from "../load-balancer/sim-ecs-service-registration.js";
import type { SimEcsService } from "../sim-ecs-service.js";
import type { SimEcsServiceStore } from "../sim-ecs-service-store.js";
import type { SimEcsContainerServer } from "./sim-ecs-container-server.js";
import type { SimEcsServiceServers } from "./sim-ecs-service-servers.js";

interface SimEcsTargetGroupContainersProperties {
  readonly services: SimEcsServiceStore;
  readonly servers: SimEcsServiceServers;
}

/**
 * A service registered into a target group, and what it registered.
 */
interface SimEcsRegisteredService {
  readonly service: SimEcsService;
  readonly registration: SimEcsServiceRegistration;
}

/**
 * Finds the container answering for a target group.
 *
 * Which service that is comes from reading the services back rather than from a
 * record kept on the target group, for the same reason simulated ELBv2 reads
 * back which load balancers forward to a group: the registration is the
 * service's, and a service deleted or replaced without the target group hearing
 * about it would leave a record that had gone stale.
 *
 * Which container of that service answers is a deliberate divergence, and it is
 * the reason this class exists rather than the lookup being a line somewhere
 * else. Real ECS sends the request to the container the registration names, on
 * the port it names. The common real task puts a proxy such as nginx on that
 * port with the application behind it, and Yulin cannot run the proxy: nothing
 * is bound to it, because there is nothing a test could bind. Routing strictly
 * by name and port would therefore send every request to a container that does
 * not exist here. So the request goes to a bound container: the one the
 * registration names where that container is bound, and otherwise the one that
 * declared the registration's port, and otherwise the first one the task
 * definition declares.
 */
export class SimEcsTargetGroupContainers {
  private readonly services: SimEcsServiceStore;
  private readonly servers: SimEcsServiceServers;

  constructor(properties: SimEcsTargetGroupContainersProperties) {
    this.services = properties.services;
    this.servers = properties.servers;
  }

  /**
   * The container answering for a target group, where one is.
   *
   * Nothing at all means there is nothing to serve the request: no active
   * service registered into the group, or one whose containers are none of
   * them bound to an HTTP handler.
   */
  find(targetGroupArn: string): SimEcsContainerServer | undefined {
    const registered = this.registeredService(targetGroupArn);

    if (registered === undefined) {
      return undefined;
    }

    return this.containerOf(registered);
  }

  /**
   * The active service registered into a target group.
   *
   * The first of them, where more than one registered into the same group.
   * Real ECS lets two services share a target group and shares the requests
   * between their tasks, which is load balancing across targets, and that is
   * not simulated.
   */
  private registeredService(
    targetGroupArn: string,
  ): SimEcsRegisteredService | undefined {
    for (const service of this.services.active()) {
      const registration = service.registrations.find(
        (candidate) => candidate.targetGroupArn === targetGroupArn,
      );

      if (registration !== undefined) {
        return { service, registration };
      }
    }

    return undefined;
  }

  private containerOf(
    registered: SimEcsRegisteredService,
  ): SimEcsContainerServer | undefined {
    const serving = this.servers.of(registered.service);
    const named = serving.find(
      (server) =>
        server.containerName === registered.registration.containerName,
    );

    return named ?? this.byPort(serving, registered.registration.containerPort);
  }

  /**
   * The bound container the registration's port means.
   *
   * A single bound container takes the request whatever port the registration
   * named, which is the proxy-in-front case: the port belongs to a container
   * Yulin has nothing to run. The port only chooses where there is a choice to
   * make, and a task whose bound containers declared none of it falls back to
   * the first, since one of them is still nearer to right than a 503.
   */
  private byPort(
    serving: readonly SimEcsContainerServer[],
    containerPort: number,
  ): SimEcsContainerServer | undefined {
    if (serving.length <= 1) {
      return serving[0];
    }

    return (
      serving.find((server) => server.listensOn(containerPort)) ?? serving[0]
    );
  }
}
