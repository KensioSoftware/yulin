import type { SimArn } from "../../aws/arn.js";
import type { SimEcsServiceDetail } from "./sim-ecs-service-detail.js";

/**
 * What a service is, as opposed to what it is being kept at.
 */
export interface SimEcsServiceIdentityProperties {
  readonly serviceArn: SimArn;
  readonly serviceName: string;
  readonly clusterArn: SimArn;
  readonly clusterName: string;
  readonly createdAt: Date;
  readonly launchType?: string | undefined;
  readonly createdBy?: string | undefined;
}

/**
 * The part of a described service that never changes.
 */
type SimEcsServiceIdentityDetail = Omit<
  SimEcsServiceDetail,
  "status" | "desiredCount" | "runningCount" | "pendingCount" | "taskDefinition"
>;

/**
 * What one simulated ECS service is.
 *
 * A service is named by the cluster it was created in, and neither that nor
 * who created it nor when ever changes. Keeping it apart from what the service
 * is being kept at is what leaves the service itself with only the second.
 */
export class SimEcsServiceIdentity {
  public readonly serviceArn: SimArn;
  public readonly serviceName: string;
  public readonly clusterArn: SimArn;
  public readonly clusterName: string;
  public readonly launchType: string | undefined;

  private readonly declared: SimEcsServiceIdentityProperties;

  constructor(declared: SimEcsServiceIdentityProperties) {
    this.declared = declared;
    this.serviceArn = declared.serviceArn;
    this.serviceName = declared.serviceName;
    this.clusterArn = declared.clusterArn;
    this.clusterName = declared.clusterName;
    this.launchType = declared.launchType;
  }

  /**
   * This part of the service as `DescribeServices` reports it.
   *
   * The load balancers and service registries are honestly empty rather than
   * left out: a service registers with neither here, and reporting nothing at
   * all would read as a service that had not been asked about them.
   */
  toOutput(): SimEcsServiceIdentityDetail {
    const { serviceArn, serviceName, clusterArn, createdAt } = this.declared;

    return {
      serviceArn,
      serviceName,
      clusterArn,
      createdAt,
      loadBalancers: [],
      serviceRegistries: [],
      ...(this.launchType !== undefined && { launchType: this.launchType }),
      ...(this.declared.createdBy !== undefined && {
        createdBy: this.declared.createdBy,
      }),
    };
  }
}
