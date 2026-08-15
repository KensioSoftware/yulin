import type { SimEcsService } from "./sim-ecs-service.js";

/**
 * The simulated ECS services one Account and Region holds.
 *
 * Services are keyed by cluster and name together, because a service name is
 * unique within a cluster on real ECS rather than across an Account: two
 * clusters may each hold a service called `checkout`, and they are two
 * services.
 *
 * A deleted service is kept rather than removed. It is still describable as
 * `INACTIVE`, as it is on real ECS, and creating a service with its name again
 * replaces it with a new active one.
 */
export class SimEcsServiceStore {
  private readonly services = new Map<string, SimEcsService>();

  private static keyFor(clusterName: string, serviceName: string): string {
    return `${clusterName}/${serviceName}`;
  }

  /**
   * Hold a service, replacing any earlier one of the same name in its cluster.
   */
  put(service: SimEcsService): void {
    const key = SimEcsServiceStore.keyFor(
      service.clusterName,
      service.serviceName,
    );

    this.services.delete(key);
    this.services.set(key, service);
  }

  /**
   * Find a service of a cluster by name, whether it is active or deleted.
   */
  find(clusterName: string, serviceName: string): SimEcsService | undefined {
    return this.services.get(
      SimEcsServiceStore.keyFor(clusterName, serviceName),
    );
  }

  /**
   * Find an active service of a cluster by name.
   */
  findActive(
    clusterName: string,
    serviceName: string,
  ): SimEcsService | undefined {
    const service = this.find(clusterName, serviceName);

    if (service?.isActive() !== true) {
      return undefined;
    }

    return service;
  }

  /**
   * The active services of this Account and Region, in creation order.
   */
  active(): readonly SimEcsService[] {
    return this.services
      .values()
      .filter((service) => service.isActive())
      .toArray();
  }
}
