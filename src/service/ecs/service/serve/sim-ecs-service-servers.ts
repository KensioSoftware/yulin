import type { SimEcsContainerServer } from "./sim-ecs-container-server.js";

/**
 * What a service names the containers of it that answer requests.
 */
export interface SimEcsServedService {
  readonly clusterName: string;
  readonly serviceName: string;
}

/**
 * The containers of the running services in one simulated ECS scope that
 * answer requests.
 *
 * One server per service and container, rather than one per task, for the same
 * reason a consuming container is polled for once per service: a desired count
 * of three is three simulated tasks reported as running rather than three
 * copies of one in-process handler. Every task of the service reaches this as
 * it comes up, and the second one finds the first one's server.
 *
 * They are held here rather than on the service because a service is state a
 * request can read and a server is the running thing behind it. That is what
 * gives deleting a service somewhere to take its containers away, and it is
 * what makes a target group with a service registered and nothing serving it
 * answer for itself.
 */
export class SimEcsServiceServers {
  private readonly servers = new Map<
    string,
    Map<string, SimEcsContainerServer>
  >();

  private static keyFor(service: SimEcsServedService): string {
    return `${service.clusterName}/${service.serviceName}`;
  }

  /**
   * Take on a container of a service that has come up, unless the service is
   * already serving from a container of that name.
   */
  ensure(service: SimEcsServedService, server: SimEcsContainerServer): void {
    const containers = this.containersOf(service);

    if (containers.has(server.containerName)) {
      return;
    }

    containers.set(server.containerName, server);
  }

  /**
   * The containers of a service that answer requests, in declaration order.
   *
   * A service with none is one nothing can be routed to, which is what a
   * target group holding it has to be able to tell.
   */
  of(service: SimEcsServedService): readonly SimEcsContainerServer[] {
    return (
      this.servers
        .get(SimEcsServiceServers.keyFor(service))
        ?.values()
        .toArray() ?? []
    );
  }

  /**
   * Give up the containers a service was serving from, as deleting it does.
   *
   * A redeploy comes back through here and then takes on the containers of the
   * revision the service moved to, so a container that stopped serving, or
   * started, in the new revision is answered for accordingly.
   */
  stop(service: SimEcsServedService): void {
    this.servers.delete(SimEcsServiceServers.keyFor(service));
  }

  private containersOf(
    service: SimEcsServedService,
  ): Map<string, SimEcsContainerServer> {
    const key = SimEcsServiceServers.keyFor(service);
    const held = this.servers.get(key);

    if (held !== undefined) {
      return held;
    }

    const containers = new Map<string, SimEcsContainerServer>();
    this.servers.set(key, containers);

    return containers;
  }
}
