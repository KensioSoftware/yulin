import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { parseSimEcsArn } from "../sim-ecs-arn.js";

/**
 * What a request named when it named a service.
 *
 * A service ARN carries the cluster the service runs in, so an ARN says which
 * cluster it belongs to while a bare name says nothing about one.
 */
export interface SimEcsNamedService {
  readonly serviceName: string;
  readonly clusterName: string | undefined;
}

/**
 * Builds and reads simulated ECS service ARNs for one Account and Region.
 *
 * A service is named either by its name or by its full ARN, as it is on real
 * ECS, and the two are interchangeable wherever a request names one. An ARN
 * belonging to another Account or Region names no service here, because it
 * names a service somewhere else on real AWS.
 */
export class SimEcsServiceArn {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * Read the `cluster/name` an ECS service ARN carries.
   *
   * The older ARN format left the cluster out, so a resource part with no
   * separator is the service name on its own.
   */
  private static splitResourceId(resourceId: string): SimEcsNamedService {
    const separatorIndex = resourceId.indexOf("/");

    if (separatorIndex === -1) {
      return { serviceName: resourceId, clusterName: undefined };
    }

    return {
      clusterName: resourceId.slice(0, separatorIndex),
      serviceName: resourceId.slice(separatorIndex + 1),
    };
  }

  /**
   * The ARN a service of this name has in a cluster in this Account and Region.
   */
  make(clusterName: string, serviceName: string): SimArn {
    const { regionName, accountId } = this.accountRegionScope;
    const resource = `${clusterName}/${serviceName}`;

    return `arn:aws:ecs:${regionName}:${accountId}:service/${resource}`;
  }

  /**
   * Read the service an identifier names, whether it is a name or a full ARN.
   *
   * Undefined covers every way an identifier names no service in this scope: it
   * is not an ARN of the right shape, it is an ARN of something else, or it is
   * an ECS service ARN belonging to another Account or Region. Callers report
   * that in their own terms, since `DescribeServices` reports a service it
   * cannot find as a failure while `UpdateService` raises.
   */
  namedService(identifier: string): SimEcsNamedService | undefined {
    if (!identifier.startsWith("arn:")) {
      return { serviceName: identifier, clusterName: undefined };
    }

    const arn = parseSimEcsArn(identifier);
    const { regionName, accountId } = this.accountRegionScope;

    if (
      arn?.resourceType !== "service" ||
      arn.region !== regionName ||
      arn.accountId !== accountId
    ) {
      return undefined;
    }

    return SimEcsServiceArn.splitResourceId(arn.resourceId);
  }
}
