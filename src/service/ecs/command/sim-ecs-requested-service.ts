import {
  SimEcsClientException,
  SimEcsServiceNotFoundException,
} from "../error/sim-ecs.error.js";
import type {
  SimEcsNamedService,
  SimEcsServiceArn,
} from "../service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "../service/sim-ecs-service-store.js";
import type { SimEcsService } from "../service/sim-ecs-service.js";

interface SimEcsRequestedServiceProperties {
  readonly services: SimEcsServiceStore;
  readonly serviceArn: SimEcsServiceArn;
}

/**
 * The service an operation is about.
 *
 * `UpdateService` and `DeleteService` both take a service the request has to
 * name, by name or by ARN, and both raise `ServiceNotFoundException` for one
 * that is not there. `DescribeServices` reports a missing one as a failure
 * entry instead, so it reads the store itself rather than through here.
 */
export class SimEcsRequestedService {
  private readonly services: SimEcsServiceStore;
  private readonly serviceArn: SimEcsServiceArn;

  constructor(properties: SimEcsRequestedServiceProperties) {
    this.services = properties.services;
    this.serviceArn = properties.serviceArn;
  }

  /**
   * The service the request named, which it has to name.
   */
  named(identifier: string | undefined, operation: string): SimEcsNamedService {
    const named =
      identifier === undefined || identifier === ""
        ? undefined
        : this.serviceArn.namedService(identifier);

    if (named === undefined) {
      throw new SimEcsClientException(
        `${operation} needs the service, named by its name or its full ARN.`,
      );
    }

    return named;
  }

  /**
   * The ARN the request's service has in the cluster it named.
   *
   * The cluster comes from the request rather than from the identifier, so an
   * ARN naming another cluster authorizes against the cluster it named and is
   * then found in neither.
   */
  arn(named: SimEcsNamedService, clusterName: string): string {
    return this.serviceArn.make(
      named.clusterName ?? clusterName,
      named.serviceName,
    );
  }

  /**
   * The active service the request named, in the cluster it named.
   */
  active(named: SimEcsNamedService, clusterName: string): SimEcsService {
    const service =
      named.clusterName === undefined || named.clusterName === clusterName
        ? this.services.findActive(clusterName, named.serviceName)
        : undefined;

    if (service === undefined) {
      throw new SimEcsServiceNotFoundException(
        `The cluster ${clusterName} holds no active service ` +
          `${named.serviceName}.`,
      );
    }

    return service;
  }
}
