import type { SimEcsServiceArn } from "../../service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "../../service/sim-ecs-service-store.js";
import type { SimEcsServiceDetail } from "../../service/sim-ecs-service-detail.js";
import type { SimEcsFailure } from "../describe-clusters/describe-clusters.command.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";

/**
 * What ECS reports for a service it cannot find.
 */
const missingReason = "MISSING";

/**
 * What a `DescribeServices` request answers with.
 */
export interface DescribedServicesOutput {
  readonly services: readonly SimEcsServiceDetail[];
  readonly failures: readonly SimEcsFailure[];
}

/**
 * Describes the services one request named, splitting answers from failures.
 *
 * A service ECS cannot find is a failure entry rather than an error, so one
 * request naming several services answers for each of them. A service of
 * another cluster is one it cannot find: a service belongs to the cluster it
 * was created in, and naming it under a different one names nothing.
 *
 * A deleted service is described as `INACTIVE` rather than reported missing,
 * which is what real ECS does with one for a while after it is deleted.
 */
export class DescribedServices {
  private readonly services: SimEcsServiceStore;
  private readonly serviceArn: SimEcsServiceArn;

  constructor(context: SimEcsServiceCommandContext) {
    this.services = context.services;
    this.serviceArn = context.serviceArn;
  }

  /**
   * Describe each service a request named, in the order it named them.
   */
  describe(
    identifiers: readonly string[],
    clusterName: string,
  ): DescribedServicesOutput {
    const services: SimEcsServiceDetail[] = [];
    const failures: SimEcsFailure[] = [];

    for (const identifier of identifiers) {
      const described = this.describeOne(identifier, clusterName);

      if (described === undefined) {
        failures.push(this.failureFor(identifier, clusterName));
        continue;
      }

      services.push(described);
    }

    return { services, failures };
  }

  private describeOne(
    identifier: string,
    clusterName: string,
  ): SimEcsServiceDetail | undefined {
    const named = this.serviceArn.namedService(identifier);

    if (named === undefined) {
      return undefined;
    }

    if (named.clusterName !== undefined && named.clusterName !== clusterName) {
      return undefined;
    }

    return this.services.find(clusterName, named.serviceName)?.toOutput();
  }

  /**
   * The failure entry for a service that is not there.
   *
   * ECS reports the ARN of the service it looked for, so an identifier given as
   * a name is reported as the ARN it would have had in the cluster the request
   * named. One that is not a service identifier at all is reported as it came.
   */
  private failureFor(identifier: string, clusterName: string): SimEcsFailure {
    const named = this.serviceArn.namedService(identifier);

    if (named === undefined) {
      return { arn: identifier, reason: missingReason };
    }

    return {
      arn: this.serviceArn.make(
        named.clusterName ?? clusterName,
        named.serviceName,
      ),
      reason: missingReason,
    };
  }
}
