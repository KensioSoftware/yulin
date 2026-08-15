import type { SimArn } from "../../aws/arn.js";
import type {
  SimEcsServiceDetail,
  SimEcsServiceLoadBalancer,
} from "./sim-ecs-service-detail.js";

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
  readonly loadBalancers?: readonly SimEcsServiceLoadBalancer[] | undefined;
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
  public readonly loadBalancers: readonly SimEcsServiceLoadBalancer[];

  private readonly declared: SimEcsServiceIdentityProperties;

  constructor(declared: SimEcsServiceIdentityProperties) {
    this.declared = declared;
    this.serviceArn = declared.serviceArn;
    this.serviceName = declared.serviceName;
    this.clusterArn = declared.clusterArn;
    this.clusterName = declared.clusterName;
    this.launchType = declared.launchType;
    this.loadBalancers = declared.loadBalancers ?? [];
  }

  /**
   * This part of the service as `DescribeServices` reports it.
   *
   * The load balancers are the ones the service was created with, held as they
   * were declared, because nothing here sends a service a request yet. The
   * service registries are honestly empty rather than left out: a service
   * registers with none here, and reporting nothing at all would read as a
   * service that had not been asked about them.
   */
  toOutput(): SimEcsServiceIdentityDetail {
    const { serviceArn, serviceName, clusterArn, createdAt } = this.declared;

    return {
      serviceArn,
      serviceName,
      clusterArn,
      createdAt,
      loadBalancers: this.loadBalancers,
      serviceRegistries: [],
      ...(this.launchType !== undefined && { launchType: this.launchType }),
      ...(this.declared.createdBy !== undefined && {
        createdBy: this.declared.createdBy,
      }),
    };
  }
}
